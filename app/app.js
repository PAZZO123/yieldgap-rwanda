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
    showAll: false, targets: {}, scope: "district", lang: "en",
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

  function binIndex(row) {
    if (!row || !row.reliable || row.gap_pct == null) return -1;
    const i = BIN_LIMITS.findIndex((limit, k) => (k === 0 ? row.gap_pct === 0 : row.gap_pct < limit));
    return i < 0 ? 4 : i;
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
    );
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const left = Math.min(x + 14, window.innerWidth - r.width - 8);
    const top = y + 14 + r.height > window.innerHeight ? y - r.height - 10 : y + 14;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
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
    node.addEventListener("click", () => select(name));
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
    const view = $("table-view");
    $("table-toggle").textContent = view.hidden ? t("showTable") : t("hideTable");

    const note = (key) => {
      const [head, ...rest] = t(key).split(" = ");
      return el("li", {}, rest.length ? [el("strong", { text: head }), " = " + rest.join(" = ")] : head);
    };
    $("notes").replaceChildren(
      el("h2", { id: "notes-title", text: t("notesTitle") }),
      el("ul", {}, ["note1", "note2", "note3", "note4"].map(note)),
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
  function renderMap() {
    const svg = $("map");
    svg.setAttribute("viewBox", `0 0 ${SHAPES.width} ${SHAPES.height}`);
    const rows = gapEntry().districts;
    const order = Object.keys(SHAPES.districts).sort((a, b) => (a === state.district) - (b === state.district));
    const nodes = order.map((name) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", SHAPES.districts[name].d);
      path.setAttribute("fill", binFill(binIndex(rows[name])));
      path.setAttribute("tabindex", "0");
      path.setAttribute("role", "button");
      path.setAttribute("aria-label", `${name}: ${gapText(rows[name])}`);
      if (name === state.district) path.classList.add("selected");
      bindDistrict(path, name);
      return path;
    });
    if (state.district) {
      const [x, y] = SHAPES.districts[state.district].label;
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", x);
      label.setAttribute("y", y);
      label.setAttribute("text-anchor", "middle");
      label.textContent = state.district;
      nodes.push(label);
    }
    svg.replaceChildren(...nodes);
    $("map-sub").textContent = t("mapSub", { crop: cropName(state.crop), s: state.season, b: fmt(gapEntry().benchmark) });
    $("legend").setAttribute("aria-label", t("mapTitle"));
    $("legend").replaceChildren(
      ...[0, 1, 2, 3, 4].map((i) => el("li", {}, el("span", { class: "swatch", style: `background:${binFill(i)}` }), t(`bin${i}`))),
      el("li", {}, el("span", { class: "swatch", style: `background:${binFill(-1)}` }), t("noData")),
    );
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

  function practicesTable() {
    const here = inputsOf(state.district);
    const nat = inputsOf("National");
    const links = D.links[state.crop] || [];
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
        el("th", { scope: "col", text: t("thRwanda") }), el("th", { scope: "col", text: t("thLink", { crop: cropInline(state.crop) }) }))),
      el("tbody", {}, D.practices.map(({ practice }) => {
        const [name, unit] = practiceName(practice);
        return el("tr", {},
          el("td", {}, name, el("div", { class: "slider-note", text: unit })),
          el("td", { text: pct(here[practice]) }),
          el("td", { text: pct(nat[practice]) }),
          el("td", {}, linkTag(practice)));
      })));
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
      el("button", { class: "ghost no-print", type: "button", text: t("print"), onclick: printSheet }));
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
        el("div", {}, el("h3", { text: t("practicesTitle") }), practicesTable())));
  }

  function printSheet() {
    $("printed-from").textContent = t("printedFrom", { url: location.href, date: new Date().toISOString().slice(0, 10) });
    window.print();
  }

  // ---------- render ----------
  function render() {
    const entry = gapEntry();
    if (!state.picked || !state.district || !entry.districts[state.district]) {
      const top = rankedRows()[0] || reliableRows()[0];
      if (!state.picked || !state.district) state.district = top ? top.name : D.districts[0].name;
    }
    renderStatic();
    renderFilters();
    renderTiles();
    renderMap();
    renderRanking();
    renderTable();
    renderOverview();
    renderDistrict();
    writeUrl();
  }

  $("table-toggle").addEventListener("click", (e) => {
    const view = $("table-view");
    view.hidden = !view.hidden;
    e.currentTarget.setAttribute("aria-expanded", String(!view.hidden));
    e.currentTarget.textContent = view.hidden ? t("showTable") : t("hideTable");
    renderTable();
  });
  $("map-csv").addEventListener("click", downloadDistricts);
  $("rank-more").addEventListener("click", () => { state.showAll = !state.showAll; renderRanking(); });
  window.addEventListener("scroll", hideTip, { passive: true });
  window.addEventListener("beforeprint", () => {
    $("printed-from").textContent = t("printedFrom", { url: location.href, date: new Date().toISOString().slice(0, 10) });
  });

  readUrl();
  render();
})();
