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
    msg.className = "empty";
    msg.textContent = I18N ? I18N.en.dataError : "The data files did not load. Please refresh the page.";
    document.body.prepend(msg);
    return;
  }

  const BIN_LIMITS = [0, 10, 20, 35]; // gap % upper bounds of bins 0-3; bin 4 is everything above
  const TOP_N = 10;
  const TABS = [
    { id: "summary", icon: "chart", label: "tabSummary" },
    { id: "crops", icon: "harvest", label: "tabCrops" },
    { id: "whatif", icon: "sliders", label: "tabWhatIf" },
    { id: "similar", icon: "peers", label: "tabSimilar" },
    { id: "goals", icon: "goal", label: "tabGoals" },
    { id: "top", icon: "podium", label: "tabTop" },
  ];
  const LAYERS = [
    { id: "gap", icon: "goal", label: "layerGap" },
    { id: "peer", icon: "peers", label: "layerPeers" },
    { id: "yield", icon: "chart", label: "layerYield" },
    { id: "extra", icon: "harvest", label: "layerHarvest" },
    { id: "value", icon: "coins", label: "layerValue" },
  ];
  const CROP_ICON = {
    "Maize": "wheat", "Sorghum": "wheat", "Paddy rice": "wheat", "Wheat": "wheat",
    "Cassava": "potato", "Sweet potato": "potato", "Irish potato": "potato", "Yams & taro": "potato",
    "Cooking banana": "banana", "Dessert banana": "banana", "Banana for beer": "banana",
    "Bush bean": "bean", "Climbing bean": "bean", "Pea": "bean", "Groundnut": "bean", "Soybean": "bean",
  };
  const state = {
    season: "A", crop: "Maize", rankBy: "extra", district: null, picked: false, tab: "summary",
    showAll: false, targets: {}, scope: "district", lang: "en", theme: "system",
    mapMetric: "gap", me: null, hl: 0, hinted: false,
  };
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isNarrow = () => window.matchMedia("(max-width: 900px)").matches;

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
  const svgEl = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    return node;
  };
  const $ = (id) => document.getElementById(id);
  // A line icon from icons.js, coloured by the surrounding text.
  function icon(name, cls) {
    const svg = svgEl("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", class: "icon" + (cls ? " " + cls : "") });
    for (const d of (window.ICONS || {})[name] || []) svg.append(svgEl("path", { d }));
    return svg;
  }
  // Icon plus a short label; the label hides on small screens but stays for screen readers.
  const iconLabel = (name, label) => [icon(name), el("span", { class: "btn-label", text: label })];
  // options: [value, label (string or nodes), disabled, title]; the title doubles as the accessible name.
  function segmented(container, options, current, onPick) {
    container.replaceChildren(...options.map(([value, label, disabled, title]) => el("button", {
      type: "button", role: "radio", "aria-checked": String(current === value), disabled: !!disabled, title,
      "aria-label": typeof label === "string" ? null : title, onclick: () => onPick(value),
    }, label)));
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
  const usable = (row) => !!row && row.yield != null && row.reliable;

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
  // Crops in the order of how much value closing their gaps would add (biggest first).
  const CROP_ORDER = (() => {
    const stake = {};
    for (const c of D.crops) {
      if (c.aggregate) continue;
      stake[c.name] = c.seasons.reduce((sum, s) => sum + reliableRows(s, c.name).reduce((a, r) => a + (r.extra_v || 0), 0), 0);
    }
    return Object.keys(stake).sort((a, b) => stake[b] - stake[a]);
  })();

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
    const [season, crop, district, tab] = decodeURIComponent(location.hash.slice(1)).split("/");
    const info = cropInfo(crop);
    if (info) state.crop = crop;
    if (season && (info || cropInfo(state.crop)).seasons.includes(season)) state.season = season;
    if (district && provinceOf(district)) { state.district = district; state.picked = true; }
    if (TABS.some((x) => x.id === tab)) state.tab = tab;
    let lang = new URLSearchParams(location.search).get("lang");
    if (!lang) { try { lang = localStorage.getItem("yieldgap-lang"); } catch (e) { /* storage blocked */ } }
    if (lang && I18N[lang]) state.lang = lang;
    try {
      const theme = localStorage.getItem("yieldgap-theme");
      if (theme === "light" || theme === "dark") state.theme = theme;
      state.hinted = !!localStorage.getItem("yieldgap-hint-done");
    } catch (e) { /* storage blocked */ }
    if (state.picked) state.hinted = true; // a shared link to a district needs no "tap a district" hint
  }
  function writeUrl() {
    const parts = [state.season, state.crop].concat(state.picked && state.district ? [state.district] : []);
    if (state.picked && state.tab !== "summary") parts.push(state.tab);
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
    renderChrome();
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

  function markHinted() {
    if (state.hinted) return;
    state.hinted = true;
    $("hint").hidden = true;
    try { localStorage.setItem("yieldgap-hint-done", "1"); } catch (e) { /* storage blocked */ }
  }
  function select(name, tab) {
    state.district = name;
    state.picked = true;
    state.targets = {};
    if (tab) state.tab = tab;
    markHinted();
    render();
  }
  function bindDistrict(node, name) {
    node.addEventListener("pointermove", (e) => showTip(name, e.clientX, e.clientY));
    node.addEventListener("pointerleave", hideTip);
    node.addEventListener("focus", () => tipAtElement(name, node));
    node.addEventListener("blur", hideTip);
    node.addEventListener("click", () => { if (!drag.suppressClick) select(name); });
    node.addEventListener("dblclick", () => zoomToDistrict(name));
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(name); }
    });
  }

  // ---------- toast: short status messages ----------
  let toastTimer = null;
  function toast(message) {
    const node = $("toast");
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 3500);
  }

  // ---------- top bar, footer, sheet labels ----------
  function renderChrome() {
    document.documentElement.lang = state.lang;
    document.title = t("title");
    segmented($("lang"), Object.keys(I18N).map((k) => [k, k.toUpperCase(), false, I18N[k].langName]), state.lang, setLang);
    $("lang").setAttribute("aria-label", t("language"));
    segmented($("theme"), [["system", [icon("auto")], false, t("themeSystem")], ["light", [icon("sun")], false, t("themeLight")],
      ["dark", [icon("moon")], false, t("themeDark")]], state.theme, setTheme);
    $("theme").setAttribute("aria-label", t("theme"));
    const help = $("help");
    help.replaceChildren(icon("help"));
    help.title = t("guide");
    help.setAttribute("aria-label", t("guide"));
    $("demo").replaceChildren(icon("play"), el("span", { class: "btn-label", text: t("watchDemo") }), el("span", { class: "btn-short", text: t("demoShort") }));
    $("demo").title = t("watchDemo");
    $("demo").setAttribute("aria-label", t("watchDemo"));
    $("demo-title").textContent = t("watchDemo");
    $("demo-note").textContent = t("demoNote");
    $("demo-close").replaceChildren(icon("close"));
    $("demo-close").title = t("close");
    $("demo-close").setAttribute("aria-label", t("close"));
    for (const node of document.querySelectorAll("[data-icon]")) node.replaceChildren(icon(node.dataset.icon));
    $("map-search").setAttribute("aria-label", t("searchLabel"));
    $("map-search").placeholder = t("searchPlaceholder");
    $("district-list").replaceChildren(...D.districts.map((d) => el("option", { value: d.name })));
    $("map").setAttribute("aria-label", t("mapLabel"));
    $("sheet-title").textContent = t("sheetTitle");
    $("sheet-csv").replaceChildren(...iconLabel("download", "CSV"));
    $("sheet-csv").title = t("downloadCsv");
    $("sheet-close").replaceChildren(icon("close"));
    $("sheet-close").title = t("close");
    $("sheet-close").setAttribute("aria-label", t("close"));

    const note = (key) => {
      const [head, ...rest] = t(key).split(" = ");
      return el("li", {}, rest.length ? [el("strong", { text: head }), " = " + rest.join(" = ")] : head);
    };
    // The method notes fold away: one tap to read, out of the way otherwise.
    $("notes").replaceChildren(
      el("details", {},
        el("summary", {}, icon("info"), el("span", { text: t("aboutTitle") })),
        el("ul", {}, ["note1", "note2", "note3", "note4", "note5"].map(note))),
      el("p", { class: "fine", text: t("builtBy") }),
      el("p", { class: "fine", text: t("sources") }),
      el("p", { class: "fine no-print" }, t("linksLabel") + " ",
        el("a", { href: "demo.mp4", text: t("watchDemo"), onclick: (e) => { e.preventDefault(); openDemo(); } }), " · ",
        el("a", { href: REPO, text: "GitHub" }), " · ",
        el("a", { href: `${REPO}/blob/main/docs/project-report.md`, text: "project report" }), " · ",
        el("a", { href: `${REPO}/blob/main/docs/methodology.md`, text: "methodology" }), " · ",
        el("a", { href: `${REPO}/blob/main/docs/AI_USE.md`, text: "AI use" })),
    );
  }

  // ---------- season pills and crop chips ----------
  function renderStrip() {
    const info = cropInfo(state.crop);
    segmented($("season"), ["A", "B"].map((s) => [s, t("seasonX", { s }), !info.seasons.includes(s),
      info.seasons.includes(s) ? t("noSeason") : t("seasonX", { s })]), state.season,
    (s) => { state.season = s; state.targets = {}; render(); });
    $("season").setAttribute("aria-label", t("season"));
    const nav = $("crops");
    nav.setAttribute("aria-label", t("crop"));
    nav.replaceChildren(...CROP_ORDER.map((c) => el("button", { type: "button", class: "chip", "aria-pressed": String(c === state.crop),
      onclick: () => pickCrop(c) }, icon(CROP_ICON[c] || "harvest"), el("span", { text: cropName(c) }))));
    const active = nav.querySelector('[aria-pressed="true"]');
    if (active) nav.scrollTo({ left: active.offsetLeft - nav.clientWidth / 2 + active.offsetWidth / 2, behavior: reducedMotion ? "auto" : "smooth" });
  }
  function pickCrop(c) {
    state.crop = c;
    const info = cropInfo(c);
    if (!info.seasons.includes(state.season)) state.season = info.seasons[0];
    state.targets = {};
    render();
  }

  // ---------- floating numbers on the map ----------
  function renderKpis() {
    const rows = reliableRows();
    const widest = rows.slice().sort((a, b) => b.gap_pct - a.gap_pct)[0];
    const extra = rows.reduce((s, r) => s + (r.extra_t || 0), 0);
    const value = cropInfo(state.crop).value_per_kg ? rows.reduce((s, r) => s + (r.extra_v || 0), 0) : null;
    const kpi = (iconName, label, big, small) => el("div", { class: "kpi" },
      el("span", { class: "kpi-icon" }, icon(iconName)),
      el("div", {}, el("div", { class: "kpi-label", text: label }),
        el("b", { text: big }), small ? el("span", { class: "kpi-small", text: small }) : null));
    $("kpis").replaceChildren(
      kpi("harvest", t("kpiExtra"), `${compact(extra)} t`, value ? `≈ ${frw(value)}` : null),
      kpi("goal", t("kpiGap"), widest ? pct(widest.gap_pct) : "–", widest ? widest.name : null),
    );
  }

  // ---------- map layer pills ----------
  function renderLayers() {
    const valued = !!cropInfo(state.crop).value_per_kg;
    const options = LAYERS.filter((l) => l.id !== "value" || valued);
    if (!options.some((l) => l.id === state.mapMetric)) state.mapMetric = "gap";
    segmented($("layers"), options.map((l) => [l.id, [icon(l.icon), el("span", { text: t(l.label) })], false, t(l.label)]),
      state.mapMetric, (m) => { state.mapMetric = m; renderMap(); renderLayers(); });
    $("layers").setAttribute("aria-label", t("layersLabel"));
  }

  // ---------- map data helpers ----------
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

  // ---------- map view: smooth zoom & pan ----------
  // The view is a centre (in map units) and a zoom factor k (1 = the whole map fits the card).
  const W = SHAPES.width;
  const H = SHAPES.height;
  const view = { cx: W / 2, cy: H / 2, k: 1 };
  const MAX_K = 9;
  let animFrame = 0;
  const mapBox = () => { const r = $("map").getBoundingClientRect(); return { cw: r.width, ch: r.height, left: r.left, top: r.top }; };
  // On phones the floating cards cover the top and bottom of the map card; fit the map between them.
  const insets = (b) => (b.cw <= 600 ? { t: 116, b: 160 } : { t: 0, b: 0 });
  const fitScale = (b) => { const i = insets(b); return Math.min(b.cw / (W * 1.06), (b.ch - i.t - i.b) / (H * 1.06)); };
  const offsetY = (b, scale) => { const i = insets(b); return (i.t - i.b) / (2 * scale); }; // map units the card centre sits above the view centre
  function applyView() {
    const b = mapBox();
    if (!b.cw || !b.ch) return;
    view.k = Math.min(MAX_K, Math.max(1, view.k));
    const scale = fitScale(b) * view.k;
    const wu = b.cw / scale;
    const hu = b.ch / scale;
    const i = insets(b);
    const hs = (b.ch - i.t - i.b) / scale; // height of the free area between the floating cards
    // Keep the map filling the free area when zoomed in; centred when it is smaller than the area.
    view.cx = wu >= W ? W / 2 : Math.min(W - wu / 2, Math.max(wu / 2, view.cx));
    view.cy = hs >= H ? H / 2 : Math.min(H - hs / 2, Math.max(hs / 2, view.cy));
    const svg = $("map");
    const top = view.cy - offsetY(b, scale) - hu / 2;
    svg.setAttribute("viewBox", `${(view.cx - wu / 2).toFixed(2)} ${top.toFixed(2)} ${wu.toFixed(2)} ${hu.toFixed(2)}`);
    // Labels and the "you are here" dot keep the same on-screen size at every zoom level.
    for (const label of svg.querySelectorAll("text")) {
      const px = label.classList.contains("selected") ? 13 : 11;
      label.style.fontSize = `${(px / scale).toFixed(3)}px`;
      label.style.strokeWidth = `${(3 / scale).toFixed(3)}px`;
    }
    for (const dot of svg.querySelectorAll(".me-dot")) dot.setAttribute("r", (6 / scale).toFixed(3));
    for (const halo of svg.querySelectorAll(".me-halo")) halo.setAttribute("r", (17 / scale).toFixed(3));
    svg.classList.toggle("zoomed", view.k > 1.02);
  }
  function setView(next, animate) {
    cancelAnimationFrame(animFrame);
    if (!animate || reducedMotion) { Object.assign(view, next); applyView(); return; }
    const from = { ...view };
    const t0 = performance.now();
    const dur = 420;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      view.cx = from.cx + (next.cx - from.cx) * e;
      view.cy = from.cy + (next.cy - from.cy) * e;
      view.k = Math.exp(Math.log(from.k) + (Math.log(next.k) - Math.log(from.k)) * e);
      applyView();
      if (p < 1) animFrame = requestAnimationFrame(step);
    };
    animFrame = requestAnimationFrame(step);
  }
  // Zoom by `factor`, keeping the point under (clientX, clientY) fixed on screen (default: the card centre).
  function zoomBy(factor, clientX, clientY, animate = true) {
    const b = mapBox();
    const fit = fitScale(b);
    const scale = fit * view.k;
    const k = Math.min(MAX_K, Math.max(1, view.k * factor));
    const sx = (clientX ?? b.left + b.cw / 2) - (b.left + b.cw / 2);
    const sy = (clientY ?? b.top + b.ch / 2) - (b.top + b.ch / 2);
    const ax = view.cx + sx / scale;
    const ay = view.cy - offsetY(b, scale) + sy / scale;
    setView({ cx: ax - sx / (fit * k), cy: ay - sy / (fit * k) + offsetY(b, fit * k), k }, animate);
  }
  function zoomToDistrict(name) {
    const path = pathByName[name];
    if (!path) return;
    const bb = path.getBBox();
    const b = mapBox();
    const i = insets(b);
    const need = Math.min(b.cw / (bb.width * 2.1), (b.ch - i.t - i.b) / (bb.height * 2.1));
    setView({ cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2, k: Math.min(MAX_K, Math.max(1.7, need / fitScale(b))) }, true);
  }
  const resetView = () => setView({ cx: W / 2, cy: H / 2, k: 1 }, true);

  // Drag to pan, two-finger pinch, wheel / trackpad zoom, double-click to zoom in.
  const drag = { pointers: new Map(), moved: false, suppressClick: false, startDist: 0 };
  function initMapInteraction() {
    const svg = $("map");
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX, e.clientY, false);
    }, { passive: false });
    svg.addEventListener("pointerdown", (e) => {
      cancelAnimationFrame(animFrame);
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
        if (drag.startDist > 0) zoomBy(dist / drag.startDist, (a.x + b.x) / 2, (a.y + b.y) / 2, false);
        drag.startDist = dist;
        drag.moved = true;
        hideTip();
        return;
      }
      if (view.k <= 1.02) return; // nothing to pan at full view
      const dx = now.x - prev.x;
      const dy = now.y - prev.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      hideTip();
      const scale = fitScale(mapBox()) * view.k;
      view.cx -= dx / scale;
      view.cy -= dy / scale;
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
    if (window.ResizeObserver) new ResizeObserver(() => applyView()).observe($("map-wrap"));
  }

  function renderMapControls() {
    const btn = (name, title, onclick, cls) => el("button", { type: "button", class: "map-btn" + (cls ? " " + cls : ""),
      title, "aria-label": title, onclick }, icon(name));
    $("map-controls").replaceChildren(
      btn("locate", t("locateTitle"), locate, "primary"),
      btn("plus", t("zoomIn"), () => zoomBy(1.7)),
      btn("minus", t("zoomOut"), () => zoomBy(1 / 1.7)),
      btn("target", t("zoomTo", { d: state.district }), () => zoomToDistrict(state.district)),
      btn("expand", t("zoomReset"), resetView),
      btn("table", t("tableLabel"), openSheet),
    );
  }

  // ---------- locate me: GPS position -> district, computed on the device ----------
  function locate() {
    if (!navigator.geolocation) { toast(t("locNoSupport")); return; }
    toast(t("locFinding"));
    navigator.geolocation.getCurrentPosition((pos) => {
      const P = SHAPES.projection;
      const x = (pos.coords.longitude - P.lon0) * P.kx * P.scale;
      const y = (P.lat1 - pos.coords.latitude) * P.scale;
      const hit = Object.entries(pathByName).find(([, p]) => p.isPointInFill(new DOMPoint(x, y)));
      if (!hit) { state.me = null; renderMap(); toast(t("locOutside")); return; }
      state.me = { x, y };
      select(hit[0]);
      zoomToDistrict(hit[0]);
      toast(t("locFound", { d: hit[0] }));
    }, (err) => toast(err.code === err.PERMISSION_DENIED ? t("locDenied") : t("locFail")),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  // ---------- the map itself ----------
  // District shapes are built once and only recoloured afterwards, so colours fade smoothly.
  const pathByName = {};
  let gOutlines;
  let gLabels;
  let gMe;
  function buildMap() {
    const svg = $("map");
    const gDistricts = svgEl("g", { id: "districts" });
    gOutlines = svgEl("g", { id: "outlines" });
    gLabels = svgEl("g", { id: "labels" });
    gMe = svgEl("g", { id: "me" });
    for (const [name, shape] of Object.entries(SHAPES.districts)) {
      const path = svgEl("path", { d: shape.d, tabindex: "0", role: "button" });
      path.dataset.name = name;
      bindDistrict(path, name);
      pathByName[name] = path;
      gDistricts.append(path);
    }
    svg.replaceChildren(gDistricts, gOutlines, gLabels, gMe);
  }
  function renderMap() {
    const metric = state.mapMetric;
    const scale = mapScale(metric);
    const rows = gapEntry().districts;
    const peers = new Set((peerInfo() || {}).peers || []);
    for (const [name, path] of Object.entries(pathByName)) {
      path.style.fill = binFill(scale.classOf(metricValue(metric, name)));
      path.setAttribute("aria-label", `${name}: ${gapText(rows[name])}`);
      path.setAttribute("aria-pressed", String(name === state.district));
    }
    // Outlines sit on top of the shapes: dashed for similar districts, solid and bold for the selected one.
    const outline = (name, cls) => svgEl("path", { d: SHAPES.districts[name].d, class: cls });
    gOutlines.replaceChildren(...[...peers].map((n) => outline(n, "outline-peer")),
      ...(state.district ? [outline(state.district, "outline-sel")] : []));
    // Names: only the selected district, plus its similar districts, so the map stays calm.
    const labelled = [...peers, ...(state.district ? [state.district] : [])];
    gLabels.replaceChildren(...labelled.map((name) => {
      const [x, y] = SHAPES.districts[name].label;
      const label = svgEl("text", { x, y, "text-anchor": "middle" });
      if (name === state.district) label.setAttribute("class", "selected");
      label.textContent = name;
      return label;
    }));
    gMe.replaceChildren(...(state.me ? ["me-halo", "me-dot"].map((cls) => svgEl("circle", { cx: state.me.x, cy: state.me.y, class: cls })) : []));
    applyView();
    renderLegend(scale, metric, peers.size > 0);
  }
  function renderLegend(scale, metric, hasPeers) {
    const title = { gap: t("legendGap", { b: fmt(gapEntry().benchmark) }), peer: t("legendPeer"), yield: t("legendYield"),
      extra: t("legendExtra"), value: t("legendValue") }[metric];
    $("legend").replaceChildren(
      el("div", { class: "legend-title", text: title }),
      el("ul", {}, ...[
        ...scale.labels.map((label, i) => el("li", {}, el("span", { class: "swatch", style: `background:${binFill(i)}` }), label)),
        el("li", {}, el("span", { class: "swatch", style: `background:${binFill(-1)}` }), t("noData")),
        hasPeers ? el("li", {}, el("span", { class: "swatch peer-swatch" }), t("mapPeers")) : null,
      ].filter(Boolean)));
  }

  function renderHint() {
    const hint = $("hint");
    hint.hidden = state.hinted;
    if (!state.hinted) hint.replaceChildren(icon("pointer"), el("span", { text: t("hintTap") }));
  }

  // ---------- highlights: one line, computed from the data, each opening the view that shows it ----------
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
    out.push({ icon: "harvest", title: t("ins1Title"), body: t("hl1", { crop: cropName(c1), s: s1, v: frw(topValue) }),
      go: { crop: c1, season: s1, district: d1.name, scope: "rwanda", tab: "crops" } });
    // 2. Biggest single-district opportunity for a different crop.
    const d2 = all.filter((r) => r.crop !== c1 && r.extra_v != null).sort((a, b) => b.extra_v - a.extra_v)[0];
    out.push({ icon: "goal", title: t("ins2Title"), body: t("hl2", { d: d2.name, crop: cropName(d2.crop), s: d2.season, v: frw(d2.extra_v) }),
      go: { crop: d2.crop, season: d2.season, district: d2.name, tab: "summary" } });
    // 3. Furthest from the PSTA 5 mineral-fertilizer target (small-scale farmers, Season A).
    const psta = D.psta && D.psta.values.A;
    if (psta) {
      const [d3, v3] = Object.entries(psta).filter(([d]) => d !== "National" && psta[d].inorganic_fertilizer != null)
        .map(([d, v]) => [d, v.inorganic_fertilizer]).sort((a, b) => a[1] - b[1])[0];
      out.push({ icon: "scale", title: t("ins3Title"), body: t("hl3", { d: d3, v: pct(v3), t: pct(D.psta.targets.inorganic_fertilizer.target) }),
        go: { crop: "Maize", season: "A", district: d3, tab: "goals" } });
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
      out.push({ icon: "peers", title: t("ins4Title"), body: t("hl4", { d: d4.d, best: d4.best, g: pct(d4.g), crop: cropName(c4), s: s4 }),
        go: { crop: c4, season: s4, district: d4.d, metric: "peer", tab: "similar" } });
    }
    return out;
  }
  function goTo(go) {
    state.crop = go.crop;
    state.season = go.season;
    state.district = go.district;
    state.picked = true;
    state.targets = {};
    state.tab = go.tab || "summary";
    if (go.scope) state.scope = go.scope;
    if (go.metric) state.mapMetric = go.metric;
    markHinted();
    render();
    zoomToDistrict(go.district);
    if (isNarrow()) $("panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function renderHighlight() {
    const items = computeInsights();
    state.hl = ((state.hl % items.length) + items.length) % items.length;
    const it = items[state.hl];
    const step = (d) => () => { state.hl += d; renderHighlight(); };
    $("highlight").replaceChildren(
      el("span", { class: "hl-icon" }, icon(it.icon)),
      el("span", { class: "hl-text" }, el("b", { text: it.title }), " ", it.body),
      el("button", { class: "hl-go", type: "button", onclick: () => goTo(it.go) }, el("span", { text: t("showMe") }), icon("arrow")),
      el("span", { class: "hl-nav" },
        el("button", { type: "button", title: t("prev"), "aria-label": t("prev"), onclick: step(-1) }, icon("chevL")),
        el("span", { class: "hl-count", text: `${state.hl + 1}/${items.length}` }),
        el("button", { type: "button", title: t("next"), "aria-label": t("next"), onclick: step(1) }, icon("chevR"))));
  }

  // ---------- district panel ----------
  function renderPanel() {
    const name = state.district;
    const row = gapEntry().districts[name];
    $("panel-head").replaceChildren(
      el("div", { class: "panel-title" },
        el("h2", { id: "district-title", text: name }),
        el("p", { text: t("panelSub", { p: provinceName(provinceOf(name)), crop: cropName(state.crop), s: state.season }) })),
      el("div", { class: "panel-actions no-print" },
        el("button", { class: "icon-btn", type: "button", title: t("share"), "aria-label": t("share"), onclick: shareLink }, icon("share")),
        el("button", { class: "icon-btn", type: "button", title: t("print"), "aria-label": t("print"), onclick: printSheet }, icon("print"))));
    if (!TABS.some((x) => x.id === state.tab)) state.tab = "summary";
    $("tabs").replaceChildren(...TABS.map((tb) => el("button", { type: "button", role: "tab", id: `tab-${tb.id}`,
      "aria-selected": String(tb.id === state.tab), "aria-controls": `pane-${tb.id}`, tabindex: tb.id === state.tab ? "0" : "-1",
      onclick: () => { state.tab = tb.id; renderPanel(); writeUrl(); } }, icon(tb.icon), el("span", { text: t(tb.label) }))));
    const builders = { summary: summaryPane, crops: cropsPane, whatif: whatIfPane, similar: similarPane, goals: goalsPane, top: topPane };
    $("panes").replaceChildren(...TABS.map((tb) => el("section", { class: "pane", id: `pane-${tb.id}`, role: "tabpanel",
      "aria-labelledby": `tab-${tb.id}`, hidden: tb.id !== state.tab }, builders[tb.id](row))));
  }
  function emptyPane(row) {
    return el("p", { class: "empty", text: !row || row.yield == null
      ? t("noEstimate", { crop: cropInline(state.crop), d: state.district })
      : t("tooSmall", { d: state.district, a: fmt(row.area), crop: cropInline(state.crop) }) });
  }

  // -- summary: four numbers, the yield bar and two short hints --
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
        el("span", { class: g.benchmark / top > 0.7 ? "end" : null, style: `left:${x(g.benchmark)}`, text: t("benchmark", { b: fmt(g.benchmark) }) })));
  }
  function summaryPane(row) {
    if (!usable(row)) return emptyPane(row);
    const g = gapEntry();
    const stat = (iconName, big, label, tone) => el("div", { class: "stat" + (tone ? " " + tone : "") },
      el("span", { class: "stat-icon" }, icon(iconName)), el("b", { text: big }), el("span", { class: "stat-label", text: label }));
    const lever = bestLever(row);
    const peer = peerInfo();
    const lines = [
      lever && ["sliders", t("leverLine", { practice: practiceName(lever.practice)[0].toLowerCase(), g: pct(lever.gain) }), "whatif"],
      peer && peer.best_yield > row.yield && ["peers", t("peerLine", { d: peer.best, p: pct(100 * (peer.best_yield / row.yield - 1)) }), "similar"],
    ].filter(Boolean);
    return el("div", { class: "pane-body" },
      el("div", { class: "stats" },
        stat("goal", row.gap_pct > 0 ? pct(row.gap_pct) : t("chipOnTarget"), t("chipGap"), row.gap_pct > 0 ? "warn" : "good"),
        stat("harvest", row.extra_t > 0 ? `${fmt(row.extra_t)} t` : "–", t("chipExtra")),
        stat("coins", row.extra_v > 0 ? frw(row.extra_v) : "–", t("chipValue")),
        stat("podium", row.rank ? `${row.rank}/${g.reliable_districts}` : "–", t("chipRank"))),
      bullet(row, null),
      lines.map(([ic, text, tab]) => el("button", { class: "line", type: "button", onclick: () => { state.tab = tab; renderPanel(); writeUrl(); } },
        icon(ic), el("span", { text }), icon("chevR"))),
      el("details", { class: "words" }, el("summary", { text: t("inWords") }), el("p", { text: briefText(row) })));
  }

  // -- crops: every crop of this district (or of Rwanda) ranked by value --
  function cropsPane() {
    const isDistrict = state.scope === "district";
    const rows = overviewRows(state.scope).filter((r) => r.extra_t > 0);
    const valued = rows.filter((r) => r.extra_v != null);
    const total = valued.reduce((s, r) => s + r.extra_v, 0);
    const max = valued.length ? valued[0].extra_v : 1;
    const scopeBox = el("div", { class: "segmented", role: "radiogroup", "aria-label": t("tabCrops") });
    segmented(scopeBox, [["district", t("scopeDistrict")], ["rwanda", t("scopeRwanda")]], state.scope,
      (s) => { state.scope = s; renderPanel(); });
    const head = el("div", { class: "pane-tools" }, scopeBox,
      el("button", { class: "ghost icon-text", type: "button", title: t("downloadCsv"), onclick: downloadOverview }, iconLabel("download", "CSV")));
    if (!rows.length) return el("div", { class: "pane-body" }, head, el("p", { class: "empty", text: t("ovNone", { d: state.district }) }));
    const open = (r) => { state.crop = r.crop; state.season = r.season; state.targets = {}; state.tab = "summary"; render(); };
    return el("div", { class: "pane-body" }, head,
      el("p", { class: "stake", text: isDistrict ? t("stakeDistrict", { v: frw(total), d: state.district }) : t("stakeRwanda", { v: frw(total) }) }),
      el("ul", { class: "croplist" }, rows.map((r) => {
        const active = r.crop === state.crop && r.season === state.season;
        const li = el("li", { class: active ? "selected" : null, tabindex: "0", role: "button",
          "aria-label": `${cropName(r.crop)}, ${t("seasonX", { s: r.season })}: ${r.extra_v != null ? frw(r.extra_v) : t("noValue")}` },
        el("span", { class: "crop-ic" }, icon(CROP_ICON[r.crop] || "harvest")),
        el("span", { class: "crop-main" },
          el("span", { class: "crop-name" }, cropName(r.crop), el("em", { text: r.season })),
          el("span", { class: "crop-sub", text: isDistrict ? t("gapBelow", { p: pct(r.gap_pct) }) : t("belowCount", { a: r.below, b: r.reliable }) })),
        el("span", { class: "crop-bar" },
          r.extra_v != null
            ? [el("span", { class: "r-fill", style: `width:${(100 * r.extra_v / max).toFixed(1)}%` }), el("span", { class: "r-val", text: frw(r.extra_v) })]
            : el("span", { class: "r-val", text: t("noValue") })));
        li.addEventListener("click", () => open(r));
        li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(r); } });
        return li;
      })));
  }

  // -- what-if --
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
  function resultView(row) {
    const sc = scenario(row);
    const gain = sc.yield - row.yield;
    const gap = gapEntry().benchmark - row.yield;
    const box = el("div", { class: "result" });
    if (gain <= 0.5) {
      box.append(el("div", { class: "result-main idle", text: t("resultIdle") }));
      return box;
    }
    const kg = gain * row.area;
    const vpk = cropInfo(state.crop).value_per_kg;
    box.append(...[
      el("div", { class: "result-main" }, `${fmt(sc.yield)} kg/ha `, el("span", { class: "up", text: `(+${pct(100 * gain / row.yield)})` })),
      el("p", { text: t("resultShort", { t: fmt(kg / 1000), v: vpk ? ` · ≈ ${frw(kg * vpk)}` : "" })
        + (gap > 0 ? ` · ${t("resultCloses", { p: pct(Math.min(100, 100 * gain / gap)) })}` : "") }),
      sc.capped ? el("p", { class: "note", text: t("resultCapped", { b: fmt(sc.best) }) }) : null,
      Object.keys(state.targets).length > 1 ? el("p", { class: "note", text: t("resultCombined") }) : null,
    ].filter(Boolean));
    return box;
  }
  function refreshScenario(row) {
    $("bullet-slot").replaceChildren(bullet(row, activeScenario(row)));
    $("result-slot").replaceChildren(resultView(row));
  }
  function whatIfPane(row) {
    if (!usable(row)) return emptyPane(row);
    const here = inputsOf(state.district);
    const links = scenarioLinks();
    const box = el("div", { class: "pane-body whatif" });
    if (!links.length) {
      box.append(el("p", { class: "empty", text: t("whatIfNone", { crop: cropInline(state.crop) }) }));
      return box;
    }
    box.append(el("div", { id: "bullet-slot" }, bullet(row, activeScenario(row))));
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
        el("div", { class: "slider-top" }, el("label", { for: id }, name), readout),
        input,
        el("div", { class: "slider-note", text: t("sliderShort", { e: pct(effectOf(l)), top: pct(top) }) })));
    }
    box.append(el("div", { id: "result-slot", "aria-live": "polite" }, resultView(row)),
      el("button", { class: "ghost icon-text", type: "button", onclick: () => { state.targets = {}; renderPanel(); } }, icon("reset"), el("span", { text: t("reset") })));
    return box;
  }

  // -- similar districts and the practices table --
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
        el("th", { scope: "col", text: t("thRwanda") }), el("th", { scope: "col", text: t("thLinkShort") }))),
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
  function similarPane(row) {
    if (!usable(row)) return emptyPane(row);
    const peer = peerInfo();
    const box = el("div", { class: "pane-body" });
    if (peer) {
      const rows = gapEntry().districts;
      const skill = ((D.peer_model || {}).by_crop || {})[`${state.season}|${state.crop}`];
      const max = Math.max(row.yield, ...peer.peers.map((p) => rows[p].yield));
      const list = [{ name: state.district, y: row.yield, here: true }, ...peer.peers.map((p) => ({ name: p, y: rows[p].yield }))]
        .sort((a, b) => b.y - a.y);
      box.append(
        el("p", { class: "lead", text: t("peersSub", { k: peer.peers.length }) }),
        el("ol", { class: "ranking" }, list.map((p) => {
          const li = el("li", { class: p.here ? "selected" : null, tabindex: p.here ? null : "0", role: p.here ? null : "button",
            "aria-label": `${p.name}: ${fmt(p.y)} kg/ha` },
          el("span", { class: "r-name", text: p.name }),
          el("span", { class: "r-bar" },
            el("span", { class: "r-fill" + (p.here ? "" : " muted"), style: `width:calc((100% - 92px) * ${(p.y / max).toFixed(3)})` }),
            el("span", { class: "r-val", text: `${fmt(p.y)}` })));
          if (!p.here) bindDistrict(li, p.name);
          return li;
        })),
        el("p", { class: "peer-note" }, icon(peer.best_yield > row.yield ? "peers" : "check"), el("span", { text: peer.best_yield > row.yield
          ? t("peerBetter", { d: peer.best, y: fmt(peer.best_yield), p: pct(100 * (peer.best_yield / row.yield - 1)) }) : t("peerNone", { d: state.district }) })),
        skill != null ? el("p", { class: "slider-note", text: skill > 0
          ? t("peerModelGood", { crop: cropInline(state.crop), p: pct(skill) }) : t("peerModelWeak", { crop: cropInline(state.crop) }) }) : null);
    } else {
      box.append(el("p", { class: "empty", text: t("noPeers") }));
    }
    box.append(el("h3", { class: "sub", text: t("practicesTitle") }), el("div", { class: "table-scroll" }, practicesTable(row)));
    return box;
  }

  // -- PSTA 5 goals --
  function goalsPane() {
    const psta = D.psta;
    const values = (psta && psta.values[state.season]) || {};
    const here = values[state.district] || {};
    const nat = values.National || {};
    const meters = psta ? Object.entries(psta.targets).filter(([p]) => here[p] != null).map(([practice, goal]) => {
      const v = here[practice];
      const gapPts = goal.target - v;
      const line = t("pstaLine", { v: pct(v), t: pct(goal.target), n: pct(nat[practice]) });
      return el("div", { class: "meter" },
        el("div", { class: "slider-top" },
          el("span", { text: practiceName(practice)[0] }),
          el("span", { class: gapPts > 0 ? null : "up", text: gapPts > 0 ? t("pstaToGo", { p: nf1.format(gapPts) }) : t("pstaMet") })),
        el("div", { class: "meter-track", role: "img", "aria-label": line },
          el("div", { class: "meter-fill", style: `width:${Math.min(100, v)}%` }),
          el("div", { class: "meter-target", style: `left:${goal.target}%` })),
        el("div", { class: "slider-note", text: line }));
    }) : [];
    return el("div", { class: "pane-body" }, el("p", { class: "lead", text: t("pstaSub", { s: state.season }) }),
      meters.length ? meters : el("p", { class: "empty", text: t("noGoals", { d: state.district }) }));
  }

  // -- top 10 districts --
  function topPane() {
    const byExtra = state.rankBy === "extra";
    const rows = rankedRows();
    const shown = state.showAll ? rows : rows.slice(0, TOP_N);
    const key = byExtra ? "extra_t" : "gap_pct";
    const max = rows.length ? rows[0][key] : 1;
    const toggle = el("div", { class: "segmented", role: "radiogroup", "aria-label": t("rankBy") });
    segmented(toggle, [["extra", t("rankExtra")], ["gap", t("rankGap")]], state.rankBy, (k) => { state.rankBy = k; renderPanel(); });
    const box = el("div", { class: "pane-body" }, el("div", { class: "pane-tools" }, toggle));
    if (!rows.length) return box.appendChild(el("p", { class: "empty", text: t("rankAllAt") })) && box;
    box.append(el("ol", { class: "ranking" }, shown.map((r) => {
      const label = byExtra ? `${fmt(r.extra_t)} t` : pct(r.gap_pct);
      const li = el("li", { tabindex: "0", role: "button", class: r.name === state.district ? "selected" : null, "aria-label": `${r.name}: ${label}` },
        el("span", { class: "r-name", text: r.name }),
        el("span", { class: "r-bar" },
          el("span", { class: "r-fill", style: `width:calc((100% - 64px) * ${(r[key] / max).toFixed(3)})` }),
          el("span", { class: "r-val", text: label })));
      bindDistrict(li, r.name);
      return li;
    })));
    if (rows.length > TOP_N) {
      box.append(el("button", { class: "ghost wide", type: "button", "aria-expanded": String(state.showAll),
        onclick: () => { state.showAll = !state.showAll; renderPanel(); } },
      state.showAll ? t("showTop") : t("showAll", { n: rows.length })));
    }
    return box;
  }

  // ---------- table sheet (every district, for screen readers and spreadsheets) ----------
  function renderTable() {
    const rows = Object.entries(gapEntry().districts)
      .map(([name, r]) => ({ name, ...r }))
      .sort((a, b) => (b.reliable - a.reliable) || ((b.extra_t || 0) - (a.extra_t || 0)) || a.name.localeCompare(b.name));
    const head = ["thDistrict", "thProvince", "thYield", "thGap", "thArea", "thExtra", "thValue"].map((k) => t(k));
    $("sheet-body").replaceChildren(el("table", {},
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
  function openSheet() { renderTable(); $("sheet").hidden = false; $("sheet-close").focus(); }
  function closeSheet() { $("sheet").hidden = true; }

  // ---------- demo video ----------
  function openDemo() {
    $("demo-sheet").hidden = false;
    $("demo-close").focus();
    $("demo-video").play().catch(() => {}); // if the browser refuses, the controls are still there
  }
  function closeDemo() {
    $("demo-video").pause();
    $("demo-sheet").hidden = true;
    $("demo").focus();
  }

  function printSheet() {
    $("printed-from").textContent = t("printedFrom", { url: location.href, date: new Date().toISOString().slice(0, 10) });
    window.print();
  }
  function shareLink() {
    if (navigator.share) {
      navigator.share({ title: t("title"), url: location.href }).catch(() => { /* closed by the user */ });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(location.href).then(() => toast(t("copied")), () => { /* clipboard blocked */ });
    }
  }

  // ---------- guided tour: a spotlight on one feature at a time ----------
  const TOUR = [
    { sel: "#crops", icon: "harvest" },
    { sel: "#season", icon: "filter" },
    { sel: "#map-wrap", icon: "pointer" },
    { sel: "#layers", icon: "layers" },
    { sel: "#map-controls", icon: "locate" },
    { sel: "#tabs", icon: "sliders" },
  ];
  const tour = { step: -1, autoScrolls: 0 };
  function placeTour() {
    const box = $("tour");
    const step = TOUR[tour.step];
    const target = document.querySelector(step.sel);
    const spot = box.querySelector(".tour-spot");
    const card = box.querySelector(".tour-card");
    const pad = 6;
    const r = target.getBoundingClientRect();
    // If something scrolled the target away, bring it back a few times; after that, follow the user's scrolling.
    if ((r.bottom < 40 || r.top > window.innerHeight - 40) && tour.autoScrolls < 3) {
      tour.autoScrolls += 1;
      target.scrollIntoView({ block: "center" });
      return;
    }
    const top = Math.max(8, r.top - pad);
    const bottom = Math.min(window.innerHeight - 8, r.bottom + pad);
    const left0 = Math.max(0, r.left - pad);
    const right0 = Math.min(window.innerWidth, r.right + pad);
    Object.assign(spot.style, { left: `${left0}px`, top: `${top}px`, width: `${right0 - left0}px`, height: `${Math.max(0, bottom - top)}px` });
    // Four shade panels around the spotlight dim the rest of the page.
    const [n, s, w, e] = box.querySelectorAll(".tour-shade");
    const px = (v) => `${Math.max(0, v)}px`;
    Object.assign(n.style, { left: "0", top: "0", width: "100vw", height: px(top) });
    Object.assign(s.style, { left: "0", top: px(bottom), width: "100vw", height: px(window.innerHeight - bottom) });
    Object.assign(w.style, { left: "0", top: px(top), width: px(left0), height: px(bottom - top) });
    Object.assign(e.style, { left: px(right0), top: px(top), width: px(window.innerWidth - right0), height: px(bottom - top) });
    const c = card.getBoundingClientRect();
    const below = bottom + 12 + c.height < window.innerHeight;
    const wanted = below ? bottom + 12 : top - 12 - c.height;
    const cardTop = Math.min(window.innerHeight - c.height - 8, Math.max(8, wanted));
    const left = Math.min(window.innerWidth - c.width - 12, Math.max(12, r.left));
    Object.assign(card.style, { top: `${cardTop}px`, left: `${left}px` });
  }
  function showTourStep(i) {
    if (i < 0 || i >= TOUR.length) { endTour(); return; }
    tour.step = i;
    tour.autoScrolls = 0;
    const step = TOUR[i];
    const last = i === TOUR.length - 1;
    const card = el("div", { class: "tour-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "tour-title" },
      el("div", { class: "tour-head" },
        el("span", { class: "tour-icon" }, icon(step.icon)),
        el("h3", { id: "tour-title", text: t(`tour${i + 1}Title`) }),
        el("button", { class: "tour-close", type: "button", title: t("tourSkip"), "aria-label": t("tourSkip"), onclick: endTour }, icon("close"))),
      el("p", { text: t(`tour${i + 1}Text`) }),
      el("div", { class: "tour-foot" },
        el("div", { class: "tour-dots", "aria-label": `${i + 1} / ${TOUR.length}` },
          TOUR.map((_, k) => el("span", { class: k === i ? "on" : null }))),
        el("div", { class: "tour-buttons" },
          i > 0 ? el("button", { class: "ghost", type: "button", text: t("tourBack"), onclick: () => showTourStep(i - 1) }) : null,
          el("button", { class: "primary-btn", type: "button", id: "tour-next", onclick: () => showTourStep(i + 1) },
            el("span", { text: last ? t("tourDone") : t("tourNext") }), last ? null : icon("arrow")))));
    $("tour").replaceChildren(...[0, 1, 2, 3].map(() => el("div", { class: "tour-shade" })), el("div", { class: "tour-spot" }), card);
    $("tour").hidden = false;
    document.querySelector(step.sel).scrollIntoView({ block: "center" });
    requestAnimationFrame(() => { placeTour(); $("tour-next").focus(); });
  }
  function startTour() { hideTip(); markHinted(); showTourStep(0); }
  function endTour() {
    tour.step = -1;
    $("tour").hidden = true;
    $("tour").replaceChildren();
  }
  window.addEventListener("resize", () => { if (tour.step >= 0) placeTour(); });
  window.addEventListener("scroll", () => { if (tour.step >= 0) placeTour(); }, { passive: true });
  document.addEventListener("keydown", (e) => {
    if (!$("sheet").hidden && e.key === "Escape") { closeSheet(); return; }
    if (!$("demo-sheet").hidden && e.key === "Escape") { closeDemo(); return; }
    if (tour.step < 0) return;
    if (e.key === "Tab") {
      // Keep keyboard focus inside the tour card while it is open.
      const items = [...$("tour").querySelectorAll("button")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!items.includes(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if (e.key === "Escape") endTour();
    else if (e.key === "ArrowRight") showTourStep(tour.step + 1);
    else if (e.key === "ArrowLeft" && tour.step > 0) showTourStep(tour.step - 1);
  });

  // ---------- render ----------
  function render() {
    const entry = gapEntry();
    if (!state.picked || !state.district || !entry.districts[state.district]) {
      const top = rankedRows()[0] || reliableRows()[0];
      if (!state.picked || !state.district) state.district = top ? top.name : D.districts[0].name;
    }
    renderChrome();
    renderStrip();
    renderHighlight();
    renderKpis();
    renderLayers();
    renderMapControls();
    renderMap();
    renderHint();
    renderPanel();
    if (!$("sheet").hidden) renderTable();
    writeUrl();
  }

  // Tabs: arrow keys move between them.
  $("tabs").addEventListener("keydown", (e) => {
    const i = TABS.findIndex((x) => x.id === state.tab);
    const j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (j == null) return;
    e.preventDefault();
    state.tab = TABS[(j + TABS.length) % TABS.length].id;
    renderPanel();
    writeUrl();
    $(`tab-${state.tab}`).focus();
  });
  $("help").addEventListener("click", () => startTour());
  $("map-search").addEventListener("change", (e) => {
    const query = e.target.value.trim().toLowerCase();
    const match = D.districts.find((d) => d.name.toLowerCase() === query)
      || D.districts.find((d) => d.name.toLowerCase().startsWith(query));
    if (!query || !match) return;
    e.target.value = "";
    select(match.name);
    zoomToDistrict(match.name);
  });
  // Pasting or editing a link in the same tab updates the view.
  window.addEventListener("hashchange", () => {
    if (location.hash === "#" + [state.season, state.crop, state.district, state.tab].map(encodeURIComponent).join("/")) return;
    readUrl();
    render();
  });
  $("sheet-csv").addEventListener("click", downloadDistricts);
  $("sheet-close").addEventListener("click", closeSheet);
  $("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) closeSheet(); });
  $("demo").addEventListener("click", openDemo);
  $("demo-close").addEventListener("click", closeDemo);
  $("demo-sheet").addEventListener("click", (e) => { if (e.target === $("demo-sheet")) closeDemo(); });
  $("map").addEventListener("pointerdown", markHinted);
  window.addEventListener("scroll", hideTip, { passive: true });
  window.addEventListener("beforeprint", () => {
    $("printed-from").textContent = t("printedFrom", { url: location.href, date: new Date().toISOString().slice(0, 10) });
  });

  buildMap();
  initMapInteraction();
  readUrl();
  render();
  requestAnimationFrame(() => { applyView(); requestAnimationFrame(() => $("map-wrap").classList.add("ready")); });
})();
