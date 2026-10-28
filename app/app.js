/* Rwanda Yield-Gap Explorer. Data: window.APP_DATA and window.DISTRICT_SHAPES, built by
   src/build_app_data.py from NISR SAS 2025 tables. Text: window.I18N (app/i18n.js). */
(function () {
  "use strict";

  const D = window.APP_DATA;
  const SHAPES = window.DISTRICT_SHAPES;
  const I18N = window.I18N;
  const NAMES = window.I18N_NAMES;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const REPO = "https://github.com/PAZZO123/yieldgap-rwanda";
  if (!D || !SHAPES || !I18N) {
    const msg = document.createElement("p");
    msg.className = "card";
    msg.textContent = I18N ? I18N.en.dataError : "The data files did not load. Please refresh the page.";
    document.querySelector("main").prepend(msg);
    return;
  }

  const BIN_LIMITS = [0, 10, 20, 35]; // gap % upper bounds of bins 0-3; bin 4 is everything above
  const TOP_N = 10;
  const state = {
    season: "A", crop: "Maize", rankBy: "extra", district: null, picked: false,
    showAll: false, targets: {}, scope: "district", lang: "en", theme: "system",
    mapMetric: "gap", showNames: false,
  };

  // ---------- text ----------
  function t(key, vars) {
    let s = (I18N[state.lang] && I18N[state.lang][key]) ?? I18N.en[key] ?? key;
    for (const [k, v] of Object.entries(vars || {})) s = s.split(`{${k}}`).join(v);
    // Kinyarwanda drops the final vowel of a connective before a vowel: "bya ibigori" -> "by'ibigori".
    if (state.lang === "rw") s = s.replace(/\b(bya|za|wa|ya|cya|rya|ra) ([aeiou])/gi, (m, w, v) => `${w.slice(0, -1)}'${v}`);
    return s;
  }
  const names = () => NAMES[state.lang] || NAMES.en;
  const cropName = (c) => names().crops[c] || NAMES.en.crops[c] || c;
  // Crop name inside a sentence: lower-case first letter, except proper nouns ("Irish potato").
  const cropInline = (c) => cropName(c).replace(/^(?!Irish)./, (ch) => ch.toLowerCase());
  const practiceName = (p) => (names().practices[p] || NAMES.en.practices[p]);
  const provinceName = (p) => names().provinces[p] || p;

  // ---------- number formats ----------
  const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
  const fmt = (v) => (v == null ? "–" : nf0.format(v));
  const pct = (v) => (v == null ? "–" : nf1.format(v) + "%");
  function compact(v) {
    if (v == null) return "–";
    if (v >= 1e6) return nf1.format(v / 1e6) + "M";
    if (v >= 1e4) return nf0.format(v / 1e3) + "K";
    if (v >= 1e3) return nf1.format(v / 1e3) + "K";
    return nf0.format(v);
  }
  function frw(v) {
    if (v == null) return null;
    if (v >= 1e9) return t("frwBn", { n: nf1.format(v / 1e9) });
    if (v >= 1e6) return t("frwM", { n: nf0.format(v / 1e6) });
    return t("frwK", { n: nf0.format(v / 1e3) });
  }

  // ---------- DOM helpers ----------
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }
  const $ = (id) => document.getElementById(id);
  function segmented(container, options, current, onPick) {
    container.replaceChildren(...options.map(([value, label, disabled, title]) => el("button", {
      type: "button", role: "radio", "aria-checked": String(current === value), disabled: !!disabled, title,
      text: label, onclick: () => onPick(value),
    })));
  }

  // ---------- data access ----------
  const cropInfo = (name) => D.crops.find((c) => c.name === name);
  const gapEntry = (season = state.season, crop = state.crop) => D.gaps[`${season}|${crop}`];
  const provinceOf = (name) => (D.districts.find((d) => d.name === name) || {}).province;
  const inputsOf = (district, season = state.season) => (D.inputs[season] || {})[district] || {};
  const scenarioLinks = (crop = state.crop) => (D.links[crop] || []).filter((l) => l.use);
  // The selected district's most similar districts for this crop and season (src/peer_districts.py).
  const peerInfo = () => ((D.peers || {})[`${state.season}|${state.crop}`] || {})[state.district];
  const effectOf = (l) => Math.min(l.pooled, l.within); // the more cautious estimate

  function reliableRows(season, crop) {
    return Object.entries(gapEntry(season, crop).districts)
      .filter(([, r]) => r.reliable).map(([name, r]) => ({ name, ...r }));
  }
  function rankedRows() {
    const key = state.rankBy === "extra" ? "extra_t" : "gap_pct";
    return reliableRows().filter((r) => r[key] > 0).sort((a, b) => b[key] - a[key]);
  }
  function bestLevel(practice, season = state.season) {
    return Math.max(...D.districts.map((d) => inputsOf(d.name, season)[practice] ?? 0));
  }

  // Gap % -> map class: 0 = at/above benchmark, 1-4 = increasingly far below, -1 = no estimate.
  function binIndex(gap) {
    if (gap == null) return -1;
    if (gap <= 0) return 0;
    const i = BIN_LIMITS.slice(1).findIndex((limit) => gap < limit);
    return i < 0 ? 4 : i + 1;
  }
  const binFill = (i) => (i < 0 ? "var(--no-data)" : `var(--ramp-${i})`);
  function gapText(row) {
    if (!row || row.yield == null) return t("gapNone");
    if (!row.reliable) return t("gapUnreliable");
    if (row.gap_pct === 0) return t("gapAt");
    return t("gapBelow", { p: pct(row.gap_pct) });
  }

  // Every crop x season for one district (or summed over Rwanda), ranked by extra value added.
  function overviewRows(scope) {
    const rows = [];
    for (const c of D.crops) {
      if (c.aggregate) continue;
      for (const s of c.seasons) {
        if (scope === "district") {
          const r = gapEntry(s, c.name).districts[state.district];
          if (!r || !r.reliable) continue;
          rows.push({ crop: c.name, season: s, gap_pct: r.gap_pct, extra_t: r.extra_t, extra_v: r.extra_v });
        } else {
          const rel = reliableRows(s, c.name);
          const sum = (k) => rel.reduce((a, r) => a + (r[k] || 0), 0);
          rows.push({
            crop: c.name, season: s, below: rel.filter((r) => r.gap_pct > 0).length, reliable: rel.length,
            extra_t: sum("extra_t"), extra_v: c.value_per_kg ? sum("extra_v") : null,
          });
        }
      }
    }
    return rows.sort((a, b) => ((b.extra_v ?? -1) - (a.extra_v ?? -1)) || (b.extra_t - a.extra_t));
  }

  // ---------- URL & language ----------
  function readUrl() {
    const [season, crop, district] = decodeURIComponent(location.hash.slice(1)).split("/");
    const info = cropInfo(crop);
    if (info) state.crop = crop;
    if (season && (info || cropInfo(state.crop)).seasons.includes(season)) state.season = season;
    if (district && provinceOf(district)) { state.district = district; state.picked = true; }
    let lang = new URLSearchParams(location.search).get("lang");
    if (!lang) { try { lang = localStorage.getItem("yieldgap-lang"); } catch (e) { /* storage blocked */ } }
    if (lang && I18N[lang]) state.lang = lang;
    try {
      const theme = localStorage.getItem("yieldgap-theme");
      if (theme === "light" || theme === "dark") state.theme = theme;
    } catch (e) { /* storage blocked */ }
  }
  function writeUrl() {
    const parts = [state.season, state.crop].concat(state.picked && state.district ? [state.district] : []);
    const query = state.lang === "en" ? "" : `?lang=${state.lang}`;
    history.replaceState(null, "", location.pathname + query + "#" + parts.map(encodeURIComponent).join("/"));
  }
  function setLang(lang) {
    state.lang = lang;
    try { localStorage.setItem("yieldgap-lang", lang); } catch (e) { /* storage blocked */ }
    render();
  }
  // "system" follows the device setting; light/dark override it (styles.css reads data-theme).
  function setTheme(theme) {
    state.theme = theme;
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("yieldgap-theme", theme); } catch (e) { /* storage blocked */ }
    renderStatic();
  }

  // ---------- downloads ----------
  function downloadCsv(filename, header, rows) {
    const cell = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const text = "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = el("a", { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function downloadDistricts() {
    const g = gapEntry();
    const rows = Object.entries(g.districts).map(([name, r]) => [
      name, provinceOf(name), state.crop, state.season, r.yield, r.area, r.reliable, g.benchmark,
      r.reliable ? r.gap_kg : "", r.reliable ? r.gap_pct : "", r.extra_t ?? "", r.extra_v ?? "",
    ]);
    downloadCsv(`yieldgap_${slug(state.crop)}_season-${state.season}.csv`,
      ["district", "province", "crop", "season", "yield_kg_ha", "harvested_area_ha", "reliable", "benchmark_kg_ha",
        "gap_kg_ha", "gap_pct", "extra_harvest_t", "extra_value_added_frw_2017_prices"], rows);
  }
  function downloadOverview() {
    const isDistrict = state.scope === "district";
    const rows = overviewRows(state.scope).map((r) => [
      isDistrict ? state.district : "Rwanda", r.crop, r.season,
      ...(isDistrict ? [r.gap_pct] : [r.below, r.reliable]), r.extra_t, r.extra_v ?? "",
    ]);
    downloadCsv(`yieldgap_priorities_${slug(isDistrict ? state.district : "rwanda")}.csv`,
      ["area", "crop", "season", ...(isDistrict ? ["gap_pct"] : ["districts_below_benchmark", "districts_reliable"]),
        "extra_harvest_t", "extra_value_added_frw_2017_prices"], rows);
  }

  // ---------- tooltip ----------
  const tip = $("tooltip");
  function showTip(name, x, y) {
    const row = gapEntry().districts[name];
    tip.replaceChildren(
      el("strong", { text: name }),
      el("div", { class: "tt-value", text: gapText(row) }),
      row && row.yield != null ? el("div", { text: t("ttYield", { y: fmt(row.yield), a: fmt(row.area) }) }) : null,
      row && row.reliable && row.extra_t > 0
        ? el("div", { text: t("ttExtra", { t: fmt(row.extra_t) }) + (row.extra_v ? ` · ${frw(row.extra_v)}` : "") }) : null,
      state.mapMetric === "peer" ? peerTip(name) : null,
    );
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const left = Math.min(x + 14, window.innerWidth - r.width - 8);
    const top = y + 14 + r.height > window.innerHeight ? y - r.height - 10 : y + 14;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
  }
  function peerTip(name) {
    const gap = peerGapPct(name);
    if (gap == null) return null;
    const peer = D.peers[`${state.season}|${state.crop}`][name];
    return el("div", { text: gap > 0 ? t("ttPeer", { p: pct(gap), best: peer.best }) : t("ttPeerTop") });
  }
  function tipAtElement(name, node) {
    const b = node.getBoundingClientRect();
    showTip(name, b.left + b.width / 2, b.top + b.height / 2);
  }
  const hideTip = () => { tip.hidden = true; };

  function select(name) {
    state.district = name;
    state.picked = true;
    state.targets = {};
    render();
  }
  function bindDistrict(node, name) {
    node.addEventListener("pointermove", (e) => showTip(name, e.clientX, e.clientY));
    node.addEventListener("pointerleave", hideTip);
    node.addEventListener("focus", () => tipAtElement(name, node));
    node.addEventListener("blur", hideTip);
    node.addEventListener("click", () => { if (!drag.suppressClick) select(name); });
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(name); }
    });
  }

  // ---------- static text ----------
  function renderStatic() {
    document.documentElement.lang = state.lang;
    document.title = t("title");
    for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
    $("filters").setAttribute("aria-label", t("filters"));
    $("map").setAttribute("aria-label", t("mapLabel"));
    segmented($("lang"), Object.keys(I18N).map((k) => [k, I18N[k].langName]), state.lang, setLang);
    segmented($("theme"), [["system", t("themeSystem")], ["light", t("themeLight")], ["dark", t("themeDark")]],
      state.theme, setTheme);
    $("table-toggle").textContent = $("table-view").hidden ? t("showTable") : t("hideTable");

    const note = (key) => {
      const [head, ...rest] = t(key).split(" = ");
      return el("li", {}, rest.length ? [el("strong", { text: head }), " = " + rest.join(" = ")] : head);
    };
    $("notes").replaceChildren(
      el("h2", { id: "notes-title", text: t("notesTitle") }),
      el("ul", {}, ["note1", "note2", "note3", "note4", "note5"].map(note)),
      el("p", { class: "fine", text: t("builtBy") }),
      el("p", { class: "fine", text: t("sources") }),
      el("p", { class: "fine no-print" }, t("linksLabel") + " ",
        el("a", { href: REPO, text: "GitHub" }), " · ",
        el("a", { href: `${REPO}/blob/main/docs/project-report.md`, text: "project report" }), " · ",
        el("a", { href: `${REPO}/blob/main/docs/methodology.md`, text: "methodology" }), " · ",
        el("a", { href: `${REPO}/blob/main/docs/AI_USE.md`, text: "AI use" })),
    );
  }

  // ---------- filters ----------
  function renderFilters() {
    const info = cropInfo(state.crop);
    segmented($("season"), ["A", "B"].map((s) => [s, t("seasonX", { s }), !info.seasons.includes(s),
      info.seasons.includes(s) ? null : t("noSeason")]), state.season,
    (s) => { state.season = s; state.targets = {}; render(); });
    segmented($("rank-by"), [["extra", t("rankExtra")], ["gap", t("rankGap")]], state.rankBy,
      (k) => { state.rankBy = k; render(); });
    $("crop").replaceChildren(...D.crops.map((c) => el("option", { value: c.name, text: cropName(c.name) })));
    $("crop").value = state.crop;
  }
  $("crop").addEventListener("change", (e) => {
    state.crop = e.target.value;
    const info = cropInfo(state.crop);
    if (!info.seasons.includes(state.season)) state.season = info.seasons[0];
    state.targets = {};
    render();
  });

  // ---------- tiles ----------
  function renderTiles() {
    const g = gapEntry();
    const rows = reliableRows();
    const below = rows.filter((r) => r.gap_pct > 0).length;
    const extra = rows.reduce((s, r) => s + (r.extra_t || 0), 0);
    const value = cropInfo(state.crop).value_per_kg ? rows.reduce((s, r) => s + (r.extra_v || 0), 0) : null;
    const all = Object.values(g.districts).filter((r) => r.yield != null).length;
    const tile = (label, valueText, unit, notes, hero) => el("div", { class: "tile" + (hero ? " hero" : "") },
      el("div", { class: "tile-label", text: label }),
      el("div", { class: "tile-value" }, valueText, unit ? el("small", { text: " " + unit }) : null),
      notes.filter(Boolean).map((n) => el("div", { class: "tile-note", text: n })));
    $("tiles").replaceChildren(
      tile(t("tileExtra"), compact(extra), "t",
        [t("tileExtraNote"), value ? t("tileValueNote", { v: frw(value) }) : null], true),
      tile(t("tileBench"), fmt(g.benchmark), "kg/ha", [t("tileBenchNote", { n: g.reliable_districts })]),
      tile(t("tileNat"), fmt(g.national_yield), "kg/ha", [t("tileNatNote")]),
      tile(t("tileBelow"), t("tileBelowValue", { a: below, b: rows.length }), null,
        [all - rows.length > 0 ? t("tileBelowMore", { n: all - rows.length }) : t("tileBelowAll")]),
    );
  }

  // ---------- map & table ----------
  // What the map is shaded by. "gap" and "peer" use the fixed gap bins; the others use quantiles.
  const MAP_METRICS = ["gap", "peer", "yield", "extra", "value"];
  // Gap to the best of a district's similar districts, % (0 if the district is the best).
  function peerGapPct(name) {
    const row = gapEntry().districts[name];
    const peer = ((D.peers || {})[`${state.season}|${state.crop}`] || {})[name];
    if (!row || !row.reliable || !peer) return null;
    return Math.max(0, 100 * (peer.best_yield - row.yield) / peer.best_yield);
  }
  function metricValue(metric, name) {
    const row = gapEntry().districts[name];
    if (metric === "peer") return peerGapPct(name);
    if (!row || !row.reliable) return null;
    return { gap: row.gap_pct, yield: row.yield, extra: row.extra_t, value: row.extra_v }[metric] ?? null;
  }
  const quantile = (sorted, q) => {
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
  };
  // Five classes for the current metric: { classOf(value) -> 0..4 or -1, labels: [5 strings] }.
  function mapScale(metric) {
    if (metric === "gap" || metric === "peer") {
      const labels = [0, 1, 2, 3, 4].map((i) => t(`bin${i}`));
      if (metric === "peer") labels[0] = t("ttPeerTop");
      return { classOf: (v) => binIndex(v), labels };
    }
    const values = D.districts.map((d) => metricValue(metric, d.name)).filter((v) => v != null);
    const unit = metric === "yield" ? (v) => fmt(v) : metric === "extra" ? (v) => `${compact(v)} t` : frw;
    let breaks;
    let labels;
    if (metric === "yield") {
      const s = values.slice().sort((a, b) => a - b);
      breaks = [0.2, 0.4, 0.6, 0.8].map((q) => quantile(s, q));
      labels = [t("legendUnder", { a: unit(breaks[0]) }),
        ...[0, 1, 2].map((i) => t("legendRange", { a: unit(breaks[i]), b: unit(breaks[i + 1]) })),
        t("legendOver", { a: unit(breaks[3]) })];
      return { labels, classOf: (v) => (v == null ? -1 : breaks.filter((b) => v >= b).length) };
    }
    // Extra harvest and value: class 0 is "none" (at the benchmark), quartiles of the rest.
    const s = values.filter((v) => v > 0).sort((a, b) => a - b);
    breaks = s.length ? [0.25, 0.5, 0.75].map((q) => quantile(s, q)) : [0, 0, 0];
    labels = [t("legendNone"), t("legendUnder", { a: unit(breaks[0]) }),
      ...[0, 1].map((i) => t("legendRange", { a: unit(breaks[i]), b: unit(breaks[i + 1]) })),
      t("legendOver", { a: unit(breaks[2]) })];
    return { labels, classOf: (v) => (v == null ? -1 : v <= 0 ? 0 : 1 + breaks.filter((b) => v >= b).length) };
  }

  // ---------- map view: zoom & pan (the SVG viewBox) ----------
  const W = SHAPES.width;
  const H = SHAPES.height;
  const view = { x: 0, y: 0, w: W };
  const MIN_W = W / 8;
  function applyView() {
    view.w = Math.min(W, Math.max(MIN_W, view.w));
    const h = view.w * H / W;
    view.x = Math.min(W - view.w, Math.max(0, view.x));
    view.y = Math.min(H - h, Math.max(0, view.y));
    const svg = $("map");
    svg.setAttribute("viewBox", `${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${h.toFixed(1)}`);
    // Labels keep the same on-screen size at every zoom level (inline style, so it beats the stylesheet).
    const scale = view.w / W;
    for (const label of svg.querySelectorAll("text")) {
      const size = label.classList.contains("selected") ? 13 : 10.5;
      label.style.fontSize = `${(size * scale).toFixed(2)}px`;
      label.style.strokeWidth = `${(3 * scale).toFixed(2)}px`;
    }
    svg.classList.toggle("zoomed", view.w < W - 1);
  }
  // Zoom by `factor` keeping the SVG point (cx, cy) under the same spot on screen.
  function zoomBy(factor, cx = view.x + view.w / 2, cy = view.y + (view.w * H / W) / 2) {
    const w = Math.min(W, Math.max(MIN_W, view.w / factor));
    const k = w / view.w;
    view.x = cx - (cx - view.x) * k;
    view.y = cy - (cy - view.y) * k;
    view.w = w;
    applyView();
  }
  function zoomToDistrict(name) {
    const path = [...$("map").querySelectorAll("path")].find((p) => p.dataset.name === name);
    if (!path) return;
    const b = path.getBBox();
    const w = Math.min(W, Math.max(MIN_W * 1.5, b.width * 2.2, b.height * 2.2 * W / H));
    view.w = w;
    view.x = b.x + b.width / 2 - w / 2;
    view.y = b.y + b.height / 2 - (w * H / W) / 2;
    applyView();
  }
  function resetView() {
    view.x = 0; view.y = 0; view.w = W;
    applyView();
  }
  // Client pixel -> SVG coordinates under the current view.
  function svgPoint(clientX, clientY) {
    const r = $("map").getBoundingClientRect();
    return { x: view.x + (clientX - r.left) / r.width * view.w, y: view.y + (clientY - r.top) / r.height * (view.w * H / W) };
  }
  // Drag to pan (when zoomed in), two-finger pinch, and Ctrl/trackpad-pinch wheel zoom.
  const drag = { pointers: new Map(), moved: false, suppressClick: false, startDist: 0 };
  function initMapInteraction() {
    const svg = $("map");
    svg.addEventListener("wheel", (e) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain scrolling keeps scrolling the page
      e.preventDefault();
      const p = svgPoint(e.clientX, e.clientY);
      zoomBy(Math.exp(-e.deltaY * 0.01), p.x, p.y);
    }, { passive: false });
    svg.addEventListener("pointerdown", (e) => {
      drag.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      drag.moved = false;
      if (drag.pointers.size === 2) {
        const [a, b] = [...drag.pointers.values()];
        drag.startDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    svg.addEventListener("pointermove", (e) => {
      const prev = drag.pointers.get(e.pointerId);
      if (!prev) return;
      const now = { x: e.clientX, y: e.clientY };
      if (drag.pointers.size === 2) {
        drag.pointers.set(e.pointerId, now);
        const [a, b] = [...drag.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (drag.startDist > 0) {
          const mid = svgPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
          zoomBy(dist / drag.startDist, mid.x, mid.y);
        }
        drag.startDist = dist;
        drag.moved = true;
        hideTip();
        return;
      }
      if (view.w >= W - 1) return; // nothing to pan at full view
      const dx = now.x - prev.x;
      const dy = now.y - prev.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      hideTip();
      const r = svg.getBoundingClientRect();
      view.x -= dx / r.width * view.w;
      view.y -= dy / r.height * (view.w * H / W);
      drag.pointers.set(e.pointerId, now);
      applyView();
    });
    const end = (e) => {
      drag.pointers.delete(e.pointerId);
      if (drag.moved) {
        // The click that ends a drag must not select a district.
        drag.suppressClick = true;
        setTimeout(() => { drag.suppressClick = false; }, 0);
      }
      if (drag.pointers.size < 2) drag.startDist = 0;
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") end(e); });
  }

  function renderMapControls() {
    const btn = (label, title, onclick) => el("button", { type: "button", class: "map-btn", title, "aria-label": title, text: label, onclick });
    $("map-controls").replaceChildren(
      btn("+", t("zoomIn"), () => zoomBy(1.6)),
      btn("−", t("zoomOut"), () => zoomBy(1 / 1.6)),
      btn("⌖", t("zoomTo", { d: state.district }), () => zoomToDistrict(state.district)),
      btn("⤢", t("zoomReset"), resetView),
    );
    const metric = $("map-metric");
    const valued = !!cropInfo(state.crop).value_per_kg;
    const options = MAP_METRICS.filter((m) => m !== "value" || valued);
    if (!options.includes(state.mapMetric)) state.mapMetric = "gap";
    const labels = { gap: "mGap", peer: "mPeer", yield: "mYield", extra: "mExtra", value: "mValue" };
    metric.replaceChildren(...options.map((m) => el("option", { value: m, text: t(labels[m]) })));
    metric.value = state.mapMetric;
    $("map-search").placeholder = t("searchPlaceholder");
    $("district-list").replaceChildren(...D.districts.map((d) => el("option", { value: d.name })));
    $("map-names").checked = state.showNames;
  }

  function renderMap() {
    const svg = $("map");
    const metric = state.mapMetric;
    const scale = mapScale(metric);
    const peers = new Set((peerInfo() || {}).peers || []);
    // Draw order: other districts, then peers, then the selected district, so outlines aren't covered.
    const layer = (name) => (name === state.district ? 2 : peers.has(name) ? 1 : 0);
    const order = Object.keys(SHAPES.districts).sort((a, b) => layer(a) - layer(b));
    const rows = gapEntry().districts;
    const nodes = order.map((name) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", SHAPES.districts[name].d);
      path.dataset.name = name;
      path.setAttribute("fill", binFill(scale.classOf(metricValue(metric, name))));
      path.setAttribute("tabindex", "0");
      path.setAttribute("role", "button");
      path.setAttribute("aria-label", `${name}: ${gapText(rows[name])}`);
      if (name === state.district) path.classList.add("selected");
      else if (peers.has(name)) path.classList.add("peer");
      bindDistrict(path, name);
      return path;
    });
    const labelled = state.showNames ? order : [state.district];
    for (const name of labelled) {
      if (!name) continue;
      const [x, y] = SHAPES.districts[name].label;
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", x);
      label.setAttribute("y", y);
      label.setAttribute("text-anchor", "middle");
      if (name === state.district) label.classList.add("selected");
      label.textContent = name;
      nodes.push(label);
    }
    svg.replaceChildren(...nodes);
    applyView();

    const subs = { peer: "mapSubPeer", yield: "mapSubYield", extra: "mapSubExtra", value: "mapSubValue" };
    $("map-sub").textContent = subs[metric]
      ? t(subs[metric], { crop: cropName(state.crop), s: state.season })
      : t("mapSub", { crop: cropName(state.crop), s: state.season, b: fmt(gapEntry().benchmark) });
    $("legend").setAttribute("aria-label", t("mapTitle"));
    $("legend").replaceChildren(...[
      ...scale.labels.map((label, i) => el("li", {}, el("span", { class: "swatch", style: `background:${binFill(i)}` }), label)),
      el("li", {}, el("span", { class: "swatch", style: `background:${binFill(-1)}` }), t("noData")),
      peers.size ? el("li", {}, el("span", { class: "swatch peer-swatch" }), t("mapPeers")) : null,
    ].filter(Boolean));
  }

  function renderTable() {
    const view = $("table-view");
    if (view.hidden) return;
    const rows = Object.entries(gapEntry().districts)
      .map(([name, r]) => ({ name, ...r }))
      .sort((a, b) => (b.reliable - a.reliable) || ((b.extra_t || 0) - (a.extra_t || 0)) || a.name.localeCompare(b.name));
    const head = ["thDistrict", "thProvince", "thYield", "thGap", "thArea", "thExtra", "thValue"].map((k) => t(k));
    view.replaceChildren(el("table", {},
      el("thead", {}, el("tr", {}, head.map((h) => el("th", { scope: "col", text: h })))),
      el("tbody", {}, rows.map((r) => el("tr", { class: r.name === state.district ? "selected" : null },
        el("td", { text: r.name }),
        el("td", { text: provinceName(provinceOf(r.name)) }),
        el("td", { text: fmt(r.yield) }),
        el("td", { text: r.reliable ? pct(r.gap_pct) : t("notReliable") }),
        el("td", { text: fmt(r.area) }),
        el("td", { text: r.reliable ? fmt(r.extra_t) : "–" }),
        el("td", { text: r.extra_v ? nf1.format(r.extra_v / 1e6) : "–" }),
      )))));
  }

  // ---------- ranking ----------
  function renderRanking() {
    const byExtra = state.rankBy === "extra";
    const rows = rankedRows();
    const shown = state.showAll ? rows : rows.slice(0, TOP_N);
    const key = byExtra ? "extra_t" : "gap_pct";
    const max = rows.length ? rows[0][key] : 1;
    $("rank-title").textContent = byExtra ? t("rankTitleExtra") : t("rankTitleGap");
    $("rank-sub").textContent = byExtra ? t("rankSubExtra") : t("rankSubGap");
    const list = $("ranking");
    if (!rows.length) {
      list.replaceChildren(el("li", { class: "empty", text: t("rankAllAt") }));
    } else {
      list.replaceChildren(...shown.map((r) => {
        const label = byExtra ? `${fmt(r.extra_t)} t` : pct(r.gap_pct);
        const li = el("li", { tabindex: "0", role: "button", class: r.name === state.district ? "selected" : null,
          "aria-label": `${r.name}: ${label}` },
          el("span", { class: "r-name", text: r.name }),
          el("span", { class: "r-bar" },
            el("span", { class: "r-fill", style: `width:calc((100% - 64px) * ${(r[key] / max).toFixed(3)})` }),
            el("span", { class: "r-val", text: label })));
        bindDistrict(li, r.name);
        return li;
      }));
    }
    const at = reliableRows().length - rows.length;
    const more = $("rank-more");
    more.hidden = rows.length <= TOP_N && at === 0;
    more.setAttribute("aria-expanded", String(state.showAll));
    more.disabled = rows.length <= TOP_N;
    more.textContent = rows.length > TOP_N
      ? (state.showAll ? t("showTop") : t("showAll", { n: rows.length })) + (at ? ` · ${t("atOrAbove", { n: at })}` : "")
      : t("atOrAbove", { n: at });
  }

  // ---------- crop priorities (overview) ----------
  function renderOverview() {
    const isDistrict = state.scope === "district";
    const rows = overviewRows(state.scope).filter((r) => r.extra_t > 0);
    const valued = rows.filter((r) => r.extra_v != null);
    const total = valued.reduce((s, r) => s + r.extra_v, 0);
    const max = valued.length ? valued[0].extra_v : 1;
    const scopeBox = el("div", { class: "segmented", role: "radiogroup", "aria-label": t("ovTitleRwanda") });
    segmented(scopeBox, [["district", t("scopeDistrict")], ["rwanda", t("scopeRwanda")]], state.scope,
      (s) => { state.scope = s; renderOverview(); });

    const head = el("div", { class: "card-head" },
      el("div", {},
        el("h2", { id: "ov-title", text: isDistrict ? t("ovTitleDistrict", { d: state.district }) : t("ovTitleRwanda") }),
        el("p", { class: "card-sub", text: t("ovSub") })),
      el("div", { class: "card-actions no-print" }, scopeBox,
        el("button", { class: "ghost", type: "button", text: t("downloadCsv"), onclick: downloadOverview })));

    if (!rows.length) {
      $("overview").replaceChildren(head, el("p", { class: "empty", text: t("ovNone", { d: state.district }) }));
      return;
    }
    const table = el("table", { class: "priorities" },
      el("thead", {}, el("tr", {},
        el("th", { scope: "col", text: t("thCrop") }),
        el("th", { scope: "col", text: t("thSeason") }),
        el("th", { scope: "col", text: isDistrict ? t("thGapPct") : t("thBelow") }),
        el("th", { scope: "col", text: t("thExtra") }),
        el("th", { scope: "col", class: "bar-col", text: t("thValueShort") }))),
      el("tbody", {}, rows.map((r) => {
        const active = r.crop === state.crop && r.season === state.season;
        const tr = el("tr", { class: "clickable" + (active ? " selected" : ""), tabindex: "0",
          "aria-label": `${cropName(r.crop)}, ${t("seasonX", { s: r.season })}: ${r.extra_v != null ? frw(r.extra_v) : t("noValue")}` },
          el("td", { text: cropName(r.crop) }),
          el("td", { text: r.season }),
          el("td", { text: isDistrict ? pct(r.gap_pct) : t("tileBelowValue", { a: r.below, b: r.reliable }) }),
          el("td", { text: fmt(r.extra_t) }),
          el("td", { class: "bar-col" }, r.extra_v != null
            ? el("span", { class: "r-bar" },
              el("span", { class: "r-fill", style: `width:calc((100% - 92px) * ${(r.extra_v / max).toFixed(3)})` }),
              el("span", { class: "r-val", text: frw(r.extra_v) }))
            : el("span", { class: "r-val", text: t("noValue") })));
        const open = () => {
          state.crop = r.crop;
          state.season = r.season;
          state.targets = {};
          render();
          $("district").scrollIntoView({ behavior: "smooth", block: "start" });
        };
        tr.addEventListener("click", open);
        tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
        return tr;
      })));
    $("overview").replaceChildren(head,
      el("p", { class: "ov-total", text: isDistrict
        ? t("ovTotalDistrict", { d: state.district, v: frw(total) }) : t("ovTotalRwanda", { v: frw(total) }) }),
      el("div", { class: "table-scroll" }, table));
  }

  // ---------- district brief ----------
  function bestLever(row) {
    const here = inputsOf(state.district);
    const best = Math.max(...reliableRows().map((r) => r.yield));
    let pick = null;
    for (const l of scenarioLinks()) {
      const now = here[l.practice];
      const top = bestLevel(l.practice);
      if (now == null || top <= now) continue;
      const raised = Math.min(best, row.yield * Math.pow(1 + effectOf(l) / 100, (top - now) / 10));
      const gain = 100 * (raised / row.yield - 1);
      if (gain > 0.5 && (!pick || gain > pick.gain)) pick = { practice: l.practice, now, top, gain };
    }
    return pick;
  }

  function briefText(row) {
    const g = gapEntry();
    const parts = [t("briefYield", { s: state.season, d: state.district, y: fmt(row.yield), crop: cropInline(state.crop), a: fmt(row.area) })];
    if (row.gap_pct > 0) {
      parts.push(t("briefGap", { p: pct(row.gap_pct), b: fmt(g.benchmark), t: fmt(row.extra_t),
        v: row.extra_v ? t("briefGapValue", { v: frw(row.extra_v) }) : "" }));
    } else {
      parts.push(t("briefAt", { b: fmt(g.benchmark) }));
    }
    if (row.rank) parts.push(t("briefRank", { d: state.district, r: row.rank, n: g.reliable_districts }));
    const peer = peerInfo();
    if (peer) {
      parts.push(peer.best_yield > row.yield
        ? t("briefPeer", { k: peer.peers.length, d: peer.best, y: fmt(peer.best_yield), p: pct(100 * (peer.best_yield / row.yield - 1)) })
        : t("briefPeerTop", { k: peer.peers.length }));
    }
    const lever = bestLever(row);
    if (lever) {
      parts.push(t("briefLever", { practice: practiceName(lever.practice)[0].toLowerCase(), now: pct(lever.now),
        top: pct(lever.top), g: pct(lever.gain) }));
    }
    const top = overviewRows("district").find((r) => r.extra_v != null && r.extra_v > 0);
    if (top) {
      parts.push(top.crop === state.crop && top.season === state.season
        ? t("briefTopSame", { d: state.district })
        : t("briefTopOther", { d: state.district, crop: cropInline(top.crop), s: top.season, v: frw(top.extra_v) }));
    }
    return parts.join(" ");
  }

  // ---------- district panel & what-if ----------
  function scenario(row) {
    const here = inputsOf(state.district);
    let factor = 1;
    for (const l of scenarioLinks()) {
      const now = here[l.practice];
      const target = state.targets[l.practice];
      if (now == null || target == null || target <= now) continue;
      factor *= Math.pow(1 + effectOf(l) / 100, (target - now) / 10);
    }
    const best = Math.max(...reliableRows().map((r) => r.yield));
    const raw = row.yield * factor;
    return { yield: Math.min(raw, best), capped: raw > best, best };
  }
  function activeScenario(row) {
    if (!Object.keys(state.targets).length) return null;
    const sc = scenario(row);
    return sc.yield > row.yield + 0.5 ? sc : null;
  }

  function bullet(row, sc) {
    const g = gapEntry();
    const top = Math.max(g.benchmark, sc ? sc.yield : 0, row.yield) * 1.12;
    const x = (v) => `${(100 * v / top).toFixed(2)}%`;
    const bar = (label, value, cls) => el("div", { class: "bullet-row" },
      el("span", { text: label }),
      el("div", { class: "bullet-track", role: "img", "aria-label": `${label}: ${fmt(value)} kg/ha; ${t("benchmark", { b: fmt(g.benchmark) })} kg/ha` },
        el("div", { class: "bullet-bar" + (cls ? " " + cls : ""), style: `width:${x(value)}` }),
        el("div", { class: "bullet-mark", style: `left:${x(g.benchmark)}` })));
    return el("div", { class: "bullet" },
      bar(t("barNow"), row.yield),
      sc ? bar(t("barScenario"), sc.yield, "scenario") : null,
      el("div", { class: "bullet-axis" },
        el("span", { style: "left:0;transform:none", text: "0" }),
        el("span", { style: `left:${x(g.benchmark)}`, text: t("benchmark", { b: fmt(g.benchmark) }) })));
  }

  function practicesTable(row) {
    const here = inputsOf(state.district);
    const nat = inputsOf("National");
    const links = D.links[state.crop] || [];
    // Show the best similar district's practices only when it out-yields this one.
    const peer = peerInfo();
    const best = peer && peer.best_yield > row.yield ? peer.best : null;
    const bestInputs = best ? inputsOf(best) : null;
    const linkTag = (p) => {
      const l = links.find((x) => x.practice === p);
      if (!l) return el("span", { class: "tag", title: t("tagUntestableTitle"), text: t("tagUntestable") });
      if (l.use) return el("span", { class: "tag strong", text: t("tagLinked", { p: pct(effectOf(l)) }) });
      if (l.evidence === "none") return el("span", { class: "tag", text: t("tagNone") });
      if (l.evidence === "suggestive") return el("span", { class: "tag", title: t("tagWeakTitle"), text: t("tagWeak") });
      return el("span", { class: "tag", title: t("tagRegionalTitle"), text: t("tagRegional") });
    };
    return el("table", { class: "practices" },
      el("thead", {}, el("tr", {},
        el("th", { scope: "col", text: t("thPractice") }), el("th", { scope: "col", text: t("thHere") }),
        best ? el("th", { scope: "col", text: best }) : null,
        el("th", { scope: "col", text: t("thRwanda") }), el("th", { scope: "col", text: t("thLink", { crop: cropInline(state.crop) }) }))),
      el("tbody", {}, D.practices.map(({ practice }) => {
        const [name, unit] = practiceName(practice);
        return el("tr", {},
          el("td", {}, name, el("div", { class: "slider-note", text: unit })),
          el("td", { text: pct(here[practice]) }),
          best ? el("td", { text: pct(bestInputs[practice]) }) : null,
          el("td", { text: pct(nat[practice]) }),
          el("td", {}, linkTag(practice)));
      })));
  }

  function peersBlock(row) {
    const peer = peerInfo();
    if (!peer) return null;
    const rows = gapEntry().districts;
    const k = peer.peers.length;
    const skill = ((D.peer_model || {}).by_crop || {})[`${state.season}|${state.crop}`];
    const max = Math.max(row.yield, ...peer.peers.map((p) => rows[p].yield));
    const line = (name, y, isHere) => {
      const li = el("li", { class: isHere ? "selected" : null, tabindex: isHere ? null : "0", role: isHere ? null : "button",
        "aria-label": `${name}: ${fmt(y)} kg/ha` },
        el("span", { class: "r-name", text: name }),
        el("span", { class: "r-bar" },
          el("span", { class: "r-fill" + (isHere ? "" : " muted"), style: `width:calc((100% - 92px) * ${(y / max).toFixed(3)})` }),
          el("span", { class: "r-val", text: `${fmt(y)} kg/ha` })));
      if (!isHere) bindDistrict(li, name);
      return li;
    };
    const list = [{ name: state.district, y: row.yield, here: true }, ...peer.peers.map((p) => ({ name: p, y: rows[p].yield }))]
      .sort((a, b) => b.y - a.y);
    return el("div", { class: "peers" },
      el("h3", { text: t("peersTitle") }),
      el("p", { class: "slider-note", text: t("peersSub", { k }) }),
      el("ol", { class: "ranking" }, list.map((p) => line(p.name, p.y, p.here))),
      el("p", { class: "peer-note", text: peer.best_yield > row.yield
        ? t("peerBetter", { d: peer.best, y: fmt(peer.best_yield), p: pct(100 * (peer.best_yield / row.yield - 1)) })
        : t("peerNone", { d: state.district }) }),
      skill != null ? el("p", { class: "slider-note", text: skill > 0
        ? t("peerModelGood", { crop: cropInline(state.crop), p: pct(skill) })
        : t("peerModelWeak", { crop: cropInline(state.crop) }) }) : null);
  }

  function pstaBlock() {
    const psta = D.psta;
    if (!psta) return null;
    const values = psta.values[state.season] || {};
    const here = values[state.district] || {};
    const nat = values.National || {};
    const meters = Object.entries(psta.targets).filter(([p]) => here[p] != null).map(([practice, goal]) => {
      const v = here[practice];
      const gapPts = goal.target - v;
      return el("div", { class: "meter" },
        el("div", { class: "slider-top" },
          el("span", { text: practiceName(practice)[0] }),
          el("span", { class: gapPts > 0 ? null : "up", text: gapPts > 0 ? t("pstaToGo", { p: nf1.format(gapPts) }) : t("pstaMet") })),
        el("div", { class: "meter-track", role: "img",
          "aria-label": t("pstaLine", { v: pct(v), t: pct(goal.target), n: pct(nat[practice]) }) },
          el("div", { class: "meter-fill", style: `width:${Math.min(100, v)}%` }),
          el("div", { class: "meter-target", style: `left:${goal.target}%` })),
        el("div", { class: "slider-note", text: t("pstaLine", { v: pct(v), t: pct(goal.target), n: pct(nat[practice]) }) }));
    });
    if (!meters.length) return null;
    return el("div", { class: "psta" },
      el("h3", { text: t("pstaTitle") }),
      el("p", { class: "slider-note", text: t("pstaSub", { s: state.season }) }),
      meters);
  }

  function resultView(row) {
    const sc = scenario(row);
    const gain = sc.yield - row.yield;
    const gap = gapEntry().benchmark - row.yield;
    const box = el("div", { class: "result" });
    if (gain <= 0.5) {
      box.append(el("div", { class: "result-main", text: t("resultIdle") }), el("p", { text: t("resultIdleNote") }));
      return box;
    }
    const kg = gain * row.area;
    const vpk = cropInfo(state.crop).value_per_kg;
    box.append(...[
      el("div", { class: "result-main" }, `${fmt(sc.yield)} kg/ha `, el("span", { class: "up", text: `(+${pct(100 * gain / row.yield)})` })),
      el("p", { text: t("resultMore", { t: fmt(kg / 1000), crop: cropInline(state.crop), a: fmt(row.area),
        v: vpk ? t("resultMoreValue", { v: frw(kg * vpk) }) : "" })
        + (gap > 0 ? t("resultClose", { p: pct(Math.min(100, 100 * gain / gap)) }) : ".") }),
      sc.capped ? el("p", { text: t("resultCapped", { b: fmt(sc.best) }) }) : null,
      Object.keys(state.targets).length > 1 ? el("p", { text: t("resultCombined") }) : null,
    ].filter(Boolean));
    return box;
  }

  function refreshScenario(row) {
    $("bullet-slot").replaceChildren(bullet(row, activeScenario(row)));
    $("result-slot").replaceChildren(resultView(row));
  }

  function whatIf(row) {
    const here = inputsOf(state.district);
    const box = el("div", { class: "whatif no-print" }, el("h3", { text: t("whatIfTitle") }));
    const links = scenarioLinks();
    if (!links.length) {
      box.append(el("p", { class: "slider-note", text: t("whatIfNone", { crop: cropInline(state.crop) }) }));
      return box;
    }
    for (const l of links) {
      const now = here[l.practice];
      if (now == null) continue;
      // Never past the highest level any district reached this season: no extrapolation beyond the data.
      const top = bestLevel(l.practice);
      if (top <= now) continue;
      const [name, unit] = practiceName(l.practice);
      const value = state.targets[l.practice] ?? now;
      const id = `slider-${l.practice}`;
      const readout = el("span", { text: `${pct(now)} → ${pct(value)}` });
      const input = el("input", { type: "range", id, min: String(now), max: String(top), step: "0.1", value: String(value),
        "aria-valuetext": `${pct(value)} ${unit}` });
      input.addEventListener("input", () => {
        const v = Number(input.value);
        state.targets[l.practice] = v;
        readout.textContent = `${pct(now)} → ${pct(v)}`;
        input.setAttribute("aria-valuetext", `${pct(v)} ${unit}`);
        refreshScenario(row);
      });
      box.append(el("div", { class: "slider" },
        el("div", { class: "slider-top" }, el("label", { for: id }, `${name} (${unit})`), readout),
        input,
        el("div", { class: "slider-note", text: t("sliderNote", { e: pct(effectOf(l)), lo: pct(l.ci[0]), hi: pct(l.ci[1]), top: pct(top) }) })));
    }
    box.append(el("div", { id: "result-slot", "aria-live": "polite" }, resultView(row)),
      el("button", { class: "ghost", type: "button", text: t("reset"), onclick: () => { state.targets = {}; renderDistrict(); } }));
    return box;
  }

  function renderDistrict() {
    const panel = $("district");
    const name = state.district;
    const row = gapEntry().districts[name];
    const head = el("div", { class: "card-head" },
      el("div", { class: "district-head" },
        el("h2", { id: "district-title", text: name }),
        el("p", { text: t("provinceLine", { p: provinceName(provinceOf(name)), crop: cropName(state.crop), s: state.season }) })),
      el("div", { class: "card-actions no-print" },
        el("button", { class: "ghost", type: "button", text: t("share"), onclick: (e) => shareLink(e.currentTarget) }),
        el("button", { class: "ghost", type: "button", text: t("print"), onclick: printSheet })));
    if (!row || row.yield == null || !row.reliable) {
      panel.replaceChildren(head, el("p", { class: "empty",
        text: !row || row.yield == null
          ? t("noEstimate", { crop: cropInline(state.crop), d: name })
          : t("tooSmall", { d: name, a: fmt(row.area), crop: cropInline(state.crop) }) }));
      return;
    }
    panel.replaceChildren(head,
      el("div", { class: "brief" }, el("h3", { text: t("briefTitle") }), el("p", { text: briefText(row) })),
      el("div", { class: "district-grid" },
        el("div", {},
          el("div", { class: "facts" },
            el("div", {}, el("div", { class: "fact-label", text: t("factYield") }), el("div", { class: "fact-value", text: `${fmt(row.yield)} kg/ha` })),
            el("div", {}, el("div", { class: "fact-label", text: t("factGap") }),
              el("div", { class: "fact-value", text: row.gap_pct > 0 ? pct(row.gap_pct) : t("factNone") })),
            el("div", {}, el("div", { class: "fact-label", text: t("factExtra") }),
              el("div", { class: "fact-value", text: row.extra_t > 0 ? `${fmt(row.extra_t)} t` : "–" }),
              row.extra_v > 0 ? el("div", { class: "fact-label", text: frw(row.extra_v) }) : null)),
          el("div", { id: "bullet-slot" }, bullet(row, activeScenario(row))),
          whatIf(row)),
        el("div", {}, el("h3", { text: t("practicesTitle") }), practicesTable(row), peersBlock(row), pstaBlock())));
  }

  function printSheet() {
    $("printed-from").textContent = t("printedFrom", { url: location.href, date: new Date().toISOString().slice(0, 10) });
    window.print();
  }

  function shareLink(button) {
    const done = () => {
      button.textContent = t("copied");
      setTimeout(() => { button.textContent = t("share"); }, 2000);
    };
    if (navigator.share) {
      navigator.share({ title: t("title"), url: location.href }).catch(() => { /* closed by the user */ });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(location.href).then(done, () => { /* clipboard blocked */ });
    }
  }

  // ---------- key insights: computed from the data, each opening the view that shows it ----------
  function computeInsights() {
    const out = [];
    const all = [];
    for (const c of D.crops) {
      if (c.aggregate) continue;
      for (const s of c.seasons) {
        for (const r of reliableRows(s, c.name)) all.push({ crop: c.name, season: s, ...r });
      }
    }
    // 1. Biggest national prize: crop x season with the most value added at stake.
    const totals = {};
    for (const r of all) {
      if (r.extra_v == null) continue;
      const key = `${r.season}|${r.crop}`;
      totals[key] = (totals[key] || 0) + r.extra_v;
    }
    const [topKey, topValue] = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
    const [s1, c1] = topKey.split("|");
    const d1 = all.filter((r) => r.crop === c1 && r.season === s1).sort((a, b) => (b.extra_v || 0) - (a.extra_v || 0))[0];
    out.push({ title: t("ins1Title"), body: t("ins1Body", { crop: cropInline(c1), s: s1, v: frw(topValue) }),
      go: { crop: c1, season: s1, district: d1.name, scope: "rwanda", target: "overview" } });
    // 2. Biggest single-district opportunity for a different crop.
    const d2 = all.filter((r) => r.crop !== c1 && r.extra_v != null).sort((a, b) => b.extra_v - a.extra_v)[0];
    out.push({ title: t("ins2Title"), body: t("ins2Body", { d: d2.name, t: fmt(d2.extra_t), crop: cropInline(d2.crop), s: d2.season, v: frw(d2.extra_v) }),
      go: { crop: d2.crop, season: d2.season, district: d2.name, target: "district" } });
    // 3. Furthest from the PSTA 5 mineral-fertilizer target (small-scale farmers, Season A).
    const psta = D.psta && D.psta.values.A;
    if (psta) {
      const [d3, v3] = Object.entries(psta).filter(([d]) => d !== "National" && psta[d].inorganic_fertilizer != null)
        .map(([d, v]) => [d, v.inorganic_fertilizer]).sort((a, b) => a[1] - b[1])[0];
      out.push({ title: t("ins3Title"), body: t("ins3Body", { d: d3, v: pct(v3), t: pct(D.psta.targets.inorganic_fertilizer.target) }),
        go: { crop: "Maize", season: "A", district: d3, target: "psta" } });
    }
    // 4. Where the peer model helps most, and the district furthest behind its best peer there.
    const skill = (D.peer_model || {}).by_crop || {};
    const bestSkill = Object.entries(skill).sort((a, b) => b[1] - a[1])[0];
    if (bestSkill) {
      const [s4, c4] = bestSkill[0].split("|");
      const peers = D.peers[bestSkill[0]] || {};
      const rows = gapEntry(s4, c4).districts;
      const d4 = Object.entries(peers).map(([d, p]) => ({ d, best: p.best, g: 100 * (p.best_yield - rows[d].yield) / p.best_yield }))
        .sort((a, b) => b.g - a.g)[0];
      out.push({ title: t("ins4Title"), body: t("ins4Body", { crop: cropInline(c4), s: s4, p: pct(bestSkill[1]), d: d4.d, best: d4.best, g: pct(d4.g) }),
        go: { crop: c4, season: s4, district: d4.d, metric: "peer", target: "map" } });
    }
    return out;
  }
  function goTo(go) {
    state.crop = go.crop;
    state.season = go.season;
    state.district = go.district;
    state.picked = true;
    state.targets = {};
    if (go.scope) state.scope = go.scope;
    if (go.metric) state.mapMetric = go.metric;
    render();
    zoomToDistrict(go.district);
    const target = { overview: "overview", district: "district", psta: "district", map: "map-title" }[go.target];
    const node = go.target === "psta" ? document.querySelector(".psta") || $(target) : $(target);
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function renderInsights() {
    $("insights").replaceChildren(...computeInsights().map((ins, i) => el("article", { class: "insight" },
      el("span", { class: "insight-num", text: String(i + 1) }),
      el("h3", { text: ins.title }),
      el("p", { text: ins.body }),
      el("button", { class: "ghost", type: "button", text: t("showMe"), onclick: () => goTo(ins.go) }))));
  }

  // ---------- render ----------
  function render() {
    const entry = gapEntry();
    if (!state.picked || !state.district || !entry.districts[state.district]) {
      const top = rankedRows()[0] || reliableRows()[0];
      if (!state.picked || !state.district) state.district = top ? top.name : D.districts[0].name;
    }
    renderStatic();
    renderInsights();
    renderFilters();
    renderTiles();
    renderMapControls();
    renderMap();
    renderRanking();
    renderTable();
    renderOverview();
    renderDistrict();
    writeUrl();
  }

  $("table-toggle").addEventListener("click", (e) => {
    const table = $("table-view");
    table.hidden = !table.hidden;
    e.currentTarget.setAttribute("aria-expanded", String(!table.hidden));
    e.currentTarget.textContent = table.hidden ? t("showTable") : t("hideTable");
    renderTable();
  });
  $("map-metric").addEventListener("change", (e) => { state.mapMetric = e.target.value; renderMap(); });
  $("map-names").addEventListener("change", (e) => { state.showNames = e.target.checked; renderMap(); });
  $("map-search").addEventListener("change", (e) => {
    const query = e.target.value.trim().toLowerCase();
    const match = D.districts.find((d) => d.name.toLowerCase() === query)
      || D.districts.find((d) => d.name.toLowerCase().startsWith(query));
    if (!query || !match) return;
    e.target.value = "";
    select(match.name);
    zoomToDistrict(match.name);
  });
  initMapInteraction();
  $("map-csv").addEventListener("click", downloadDistricts);
  $("rank-more").addEventListener("click", () => { state.showAll = !state.showAll; renderRanking(); });
  window.addEventListener("scroll", hideTip, { passive: true });
  window.addEventListener("beforeprint", () => {
    $("printed-from").textContent = t("printedFrom", { url: location.href, date: new Date().toISOString().slice(0, 10) });
  });

  readUrl();
  render();
})();
