/* Rwanda Yield-Gap Explorer. Data: window.APP_DATA and window.DISTRICT_SHAPES,
   built by src/build_app_data.py from NISR SAS 2025 tables. */
(function () {
  "use strict";

  const D = window.APP_DATA;
  const SHAPES = window.DISTRICT_SHAPES;
  const SVG_NS = "http://www.w3.org/2000/svg";
  if (!D || !SHAPES) {
    const msg = document.createElement("p");
    msg.className = "card";
    msg.textContent = "The data files did not load. Please refresh the page.";
    document.querySelector("main").prepend(msg);
    return;
  }

  const PRACTICE_LABELS = {
    improved_seed: ["Improved seed", "% of crop area"],
    inorganic_fertilizer: ["Mineral fertilizer", "% of crop area"],
    organic_fertilizer: ["Manure / organic fertilizer", "% of crop area"],
    erosion_control: ["Erosion control", "% of farmers"],
    irrigation: ["Irrigation", "% of farmers"],
    mechanization: ["Machines", "% of farmers"],
    agroforestry: ["Agroforestry", "% of farmers"],
  };
  const BINS = [
    { label: "At or above benchmark", test: (g) => g === 0 },
    { label: "Under 10% below", test: (g) => g < 10 },
    { label: "10–20% below", test: (g) => g < 20 },
    { label: "20–35% below", test: (g) => g < 35 },
    { label: "35% or more below", test: () => true },
  ];
  const TOP_N = 10;

  const state = { season: "A", crop: "Maize", rankBy: "extra", district: null, picked: false, showAll: false, targets: {} };

  // ---------- helpers ----------
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
  const cropInfo = (name) => D.crops.find((c) => c.name === name);
  const cropLabel = (name) => name.replace("(all)", "(all types)");
  const gapEntry = () => D.gaps[`${state.season}|${state.crop}`];
  const provinceOf = (name) => (D.districts.find((d) => d.name === name) || {}).province;
  const provinceLabel = (p) => (p === "Kigali City" ? "Kigali City" : `${p} Province`);

  function binIndex(row) {
    if (!row || !row.reliable || row.gap_pct == null) return -1;
    return BINS.findIndex((b) => b.test(row.gap_pct));
  }
  function binFill(i) {
    return i < 0 ? "var(--no-data)" : `var(--ramp-${i})`;
  }
  function gapText(row) {
    if (!row || row.yield == null) return "Not grown / no estimate";
    if (!row.reliable) return "No reliable estimate (under 200 ha)";
    if (row.gap_pct === 0) return "At or above benchmark";
    return `${pct(row.gap_pct)} below benchmark`;
  }

  // ---------- URL state ----------
  function readHash() {
    const [season, crop, district] = decodeURIComponent(location.hash.slice(1)).split("/");
    const info = cropInfo(crop);
    if (info) state.crop = crop;
    if (season && (info || cropInfo(state.crop)).seasons.includes(season)) state.season = season;
    if (district && provinceOf(district)) { state.district = district; state.picked = true; }
  }
  function writeHash() {
    const parts = [state.season, state.crop].concat(state.picked && state.district ? [state.district] : []);
    history.replaceState(null, "", "#" + parts.map(encodeURIComponent).join("/"));
  }

  // ---------- tooltip ----------
  const tip = $("tooltip");
  function showTip(name, x, y) {
    const row = gapEntry().districts[name];
    tip.replaceChildren(
      el("strong", { text: name }),
      el("div", { class: "tt-value", text: gapText(row) }),
      row && row.yield != null ? el("div", { text: `Yield ${fmt(row.yield)} kg/ha · ${fmt(row.area)} ha harvested` }) : null,
      row && row.reliable && row.extra_t > 0 ? el("div", { text: `+${fmt(row.extra_t)} t at benchmark` }) : null,
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

  // ---------- filters ----------
  function renderFilters() {
    const info = cropInfo(state.crop);
    $("season").replaceChildren(...["A", "B"].map((s) => el("button", {
      type: "button", role: "radio", "aria-checked": String(state.season === s),
      disabled: !info.seasons.includes(s),
      title: info.seasons.includes(s) ? null : "Too few districts grow this crop in this season for a benchmark",
      text: `Season ${s}`,
      onclick: () => { state.season = s; state.targets = {}; render(); },
    })));
    $("rank-by").replaceChildren(...[["extra", "Extra harvest"], ["gap", "Gap %"]].map(([k, label]) => el("button", {
      type: "button", role: "radio", "aria-checked": String(state.rankBy === k), text: label,
      onclick: () => { state.rankBy = k; render(); },
    })));
  }
  function initCropSelect() {
    const select = $("crop");
    select.replaceChildren(...D.crops.map((c) => el("option", { value: c.name, text: cropLabel(c.name) })));
    select.addEventListener("change", () => {
      state.crop = select.value;
      const info = cropInfo(state.crop);
      if (!info.seasons.includes(state.season)) state.season = info.seasons[0];
      state.targets = {};
      render();
    });
  }

  // ---------- data views ----------
  function reliableRows() {
    return Object.entries(gapEntry().districts)
      .filter(([, r]) => r.reliable)
      .map(([name, r]) => ({ name, ...r }));
  }
  function rankedRows() {
    const key = state.rankBy === "extra" ? "extra_t" : "gap_pct";
    return reliableRows().filter((r) => r[key] > 0).sort((a, b) => b[key] - a[key]);
  }

  function renderTiles() {
    const g = gapEntry();
    const rows = reliableRows();
    const below = rows.filter((r) => r.gap_pct > 0).length;
    const extra = rows.reduce((s, r) => s + (r.extra_t || 0), 0);
    const all = Object.values(g.districts).filter((r) => r.yield != null).length;
    const tile = (label, value, unit, note, hero) => el("div", { class: "tile" + (hero ? " hero" : "") },
      el("div", { class: "tile-label", text: label }),
      el("div", { class: "tile-value" }, value, unit ? el("small", { text: " " + unit }) : null),
      el("div", { class: "tile-note", text: note }));
    $("tiles").replaceChildren(
      tile("Extra harvest possible", compact(extra), "t", "if every district reached the benchmark", true),
      tile("Benchmark yield", fmt(g.benchmark), "kg/ha", `top quarter of ${g.reliable_districts} districts`),
      // Area-weighted over all farms, so it can sit above the district benchmark when the
      // best districts also farm the most land.
      tile("National average", fmt(g.national_yield), "kg/ha", "weighted by area, all farms"),
      tile("Districts below benchmark", `${below} of ${rows.length}`, null,
        all - rows.length > 0 ? `${all - rows.length} more grow it on under 200 ha` : "all have reliable estimates"),
    );
  }

  function renderMap() {
    const svg = $("map");
    svg.setAttribute("viewBox", `0 0 ${SHAPES.width} ${SHAPES.height}`);
    const rows = gapEntry().districts;
    const names = Object.keys(SHAPES.districts).sort((a, b) => (a === state.district) - (b === state.district));
    const nodes = names.map((name) => {
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
    $("map-sub").textContent = `${cropLabel(state.crop)}, Season ${state.season} 2025 · benchmark ${fmt(gapEntry().benchmark)} kg/ha`;
    $("legend").replaceChildren(
      ...BINS.map((b, i) => el("li", {}, el("span", { class: "swatch", style: `background:${binFill(i)}` }), b.label)),
      el("li", {}, el("span", { class: "swatch", style: `background:${binFill(-1)}` }), "No reliable estimate"),
    );
  }

  function renderTable() {
    const view = $("table-view");
    if (view.hidden) return;
    const rows = Object.entries(gapEntry().districts)
      .map(([name, r]) => ({ name, ...r }))
      .sort((a, b) => (b.reliable - a.reliable) || ((b.extra_t || 0) - (a.extra_t || 0)) || a.name.localeCompare(b.name));
    const head = ["District", "Province", "Yield (kg/ha)", "Gap", "Area (ha)", "Extra (t)"];
    view.replaceChildren(el("table", {},
      el("thead", {}, el("tr", {}, head.map((h) => el("th", { scope: "col", text: h })))),
      el("tbody", {}, rows.map((r) => el("tr", { class: r.name === state.district ? "selected" : null },
        el("td", { text: r.name }),
        el("td", { text: provinceOf(r.name) }),
        el("td", { text: fmt(r.yield) }),
        el("td", { text: r.reliable ? pct(r.gap_pct) : "not reliable" }),
        el("td", { text: fmt(r.area) }),
        el("td", { text: r.reliable ? fmt(r.extra_t) : "–" }),
      )))));
  }

  function renderRanking() {
    const byExtra = state.rankBy === "extra";
    const rows = rankedRows();
    const shown = state.showAll ? rows : rows.slice(0, TOP_N);
    const key = byExtra ? "extra_t" : "gap_pct";
    const max = rows.length ? rows[0][key] : 1;
    $("rank-title").textContent = byExtra ? "Where closing the gap adds the most food" : "Where the gap is largest";
    $("rank-sub").textContent = byExtra
      ? "Extra tonnes if the district reached the benchmark (gap × harvested area)"
      : "% below the benchmark yield";
    const list = $("ranking");
    if (!rows.length) {
      list.replaceChildren(el("li", { class: "empty", text: "Every district with a reliable estimate is at or above the benchmark." }));
    } else {
      list.replaceChildren(...shown.map((r) => {
        const li = el("li", { tabindex: "0", role: "button", class: r.name === state.district ? "selected" : null,
          "aria-label": `${r.name}: ${byExtra ? fmt(r.extra_t) + " tonnes" : pct(r.gap_pct) + " below benchmark"}` },
          el("span", { class: "r-name", text: r.name }),
          el("span", { class: "r-bar" },
            el("span", { class: "r-fill", style: `width:calc(${(100 * r[key] / max).toFixed(1)}% - 64px)` }),
            el("span", { class: "r-val", text: byExtra ? `${fmt(r.extra_t)} t` : pct(r.gap_pct) })));
        bindDistrict(li, r.name);
        return li;
      }));
    }
    const at = reliableRows().length - rows.length;
    const more = $("rank-more");
    more.hidden = rows.length <= TOP_N && at === 0;
    more.setAttribute("aria-expanded", String(state.showAll));
    more.textContent = rows.length > TOP_N
      ? (state.showAll ? "Show top 10" : `Show all ${rows.length}`) + (at ? ` · ${at} at or above benchmark` : "")
      : `${at} district${at === 1 ? "" : "s"} at or above benchmark`;
    more.disabled = rows.length <= TOP_N;
  }

  // ---------- district panel & what-if ----------
  function scenarioLinks() {
    return (D.links[state.crop] || []).filter((l) => l.use);
  }
  function scenario(row) {
    const inputs = (D.inputs[state.season] || {})[state.district] || {};
    let factor = 1;
    for (const l of scenarioLinks()) {
      const now = inputs[l.practice];
      const target = state.targets[l.practice];
      if (now == null || target == null || target <= now) continue;
      const effect = Math.min(l.pooled, l.within); // the more cautious estimate
      factor *= Math.pow(1 + effect / 100, (target - now) / 10);
    }
    const best = Math.max(...reliableRows().map((r) => r.yield));
    const raw = row.yield * factor;
    return { yield: Math.min(raw, best), capped: raw > best, best };
  }

  function bullet(row, sc) {
    const g = gapEntry();
    const top = Math.max(g.benchmark, sc ? sc.yield : 0, row.yield) * 1.12;
    const x = (v) => `${(100 * v / top).toFixed(2)}%`;
    const bar = (label, value, cls) => el("div", { class: "bullet-row" },
      el("span", { text: label }),
      el("div", { class: "bullet-track", role: "img", "aria-label": `${label}: ${fmt(value)} kg/ha; benchmark ${fmt(g.benchmark)} kg/ha` },
        el("div", { class: "bullet-bar" + (cls ? " " + cls : ""), style: `width:${x(value)}` }),
        el("div", { class: "bullet-mark", style: `left:${x(g.benchmark)}` })));
    return el("div", { class: "bullet" },
      bar("Yield now", row.yield),
      sc ? bar("With changes", sc.yield, "scenario") : null,
      el("div", { class: "bullet-axis" },
        el("span", { style: "left:0;transform:none", text: "0" }),
        el("span", { style: `left:${x(g.benchmark)}`, text: `benchmark ${fmt(g.benchmark)}` })));
  }

  function practicesTable() {
    const inputs = D.inputs[state.season] || {};
    const here = inputs[state.district] || {};
    const nat = inputs.National || {};
    const links = D.links[state.crop] || [];
    const linkTag = (p) => {
      const l = links.find((x) => x.practice === p);
      if (!l) return el("span", { class: "tag", title: "Too little difference between districts to measure a link", text: "Not testable" });
      if (l.use) return el("span", { class: "tag strong", text: `+${nf1.format(Math.min(l.pooled, l.within))}% per +10 pts` });
      if (l.evidence === "none") return el("span", { class: "tag", text: "No clear link" });
      if (l.evidence === "suggestive") return el("span", { class: "tag", title: "Not significant after allowing for the many links tested", text: "Weak link" });
      return el("span", { class: "tag", title: "Strong in the data but mostly reflects where the crop is grown; see methods", text: "Regional pattern" });
    };
    return el("table", { class: "practices" },
      el("thead", {}, el("tr", {},
        el("th", { scope: "col", text: "Practice" }), el("th", { scope: "col", text: "Here" }),
        el("th", { scope: "col", text: "Rwanda" }), el("th", { scope: "col", text: `Link with ${cropLabel(state.crop).toLowerCase()} yield` }))),
      el("tbody", {}, D.practices.map(({ practice }) => {
        const [name, unit] = PRACTICE_LABELS[practice];
        return el("tr", {},
          el("td", {}, name, el("div", { class: "slider-note", text: unit })),
          el("td", { text: pct(here[practice]) }),
          el("td", { text: pct(nat[practice]) }),
          el("td", {}, linkTag(practice)));
      })));
  }

  function whatIf(row) {
    const links = scenarioLinks();
    const inputs = (D.inputs[state.season] || {})[state.district] || {};
    const box = el("div", { class: "whatif" }, el("h3", { text: "What if more farmers here used…" }));
    if (!links.length) {
      box.append(el("p", { class: "slider-note",
        text: `For ${cropLabel(state.crop).toLowerCase()}, none of the practices has a link with yield that is strong and consistent enough to model from 2025 district data. That doesn't mean they don't help, only that district averages can't show it.` }));
      return box;
    }
    for (const l of links) {
      const now = inputs[l.practice];
      if (now == null) continue;
      const [name, unit] = PRACTICE_LABELS[l.practice];
      // Never past the highest level any district reached this season: no extrapolation beyond the data.
      const top = Math.max(...D.districts.map((d) => ((D.inputs[state.season] || {})[d.name] || {})[l.practice] ?? 0));
      if (top <= now) continue;
      const value = state.targets[l.practice] ?? now;
      const id = `slider-${l.practice}`;
      const readout = el("span", { text: `${pct(now)} → ${pct(value)}` });
      const input = el("input", { type: "range", id, min: String(now), max: String(top), step: "0.1", value: String(value),
        "aria-valuetext": `${pct(value)} ${unit}` });
      input.addEventListener("input", () => {
        state.targets[l.practice] = Number(input.value);
        readout.textContent = `${pct(now)} → ${pct(Number(input.value))}`;
        input.setAttribute("aria-valuetext", `${pct(Number(input.value))} ${unit}`);
        refreshScenario(row);
      });
      box.append(el("div", { class: "slider" },
        el("div", { class: "slider-top" }, el("label", { for: id }, `${name} (${unit})`), readout),
        input,
        el("div", { class: "slider-note", text: `+${nf1.format(Math.min(l.pooled, l.within))}% yield per +10 points (95% range ${nf1.format(l.ci[0])} to ${nf1.format(l.ci[1])}%). Goes up to ${pct(top)}, the highest level any district reached.` })));
    }
    box.append(el("div", { id: "result-slot", "aria-live": "polite" }, resultView(row)),
      el("button", { class: "ghost", type: "button", text: "Reset", onclick: () => { state.targets = {}; renderDistrict(); } }));
    return box;
  }

  function activeScenario(row) {
    if (!Object.keys(state.targets).length) return null;
    const sc = scenario(row);
    return sc.yield > row.yield + 0.5 ? sc : null;
  }

  // Slider moves only redraw the bars and the result, so the slider being dragged stays in place.
  function refreshScenario(row) {
    $("bullet-slot").replaceChildren(bullet(row, activeScenario(row)));
    $("result-slot").replaceChildren(resultView(row));
  }

  function resultView(row) {
    const sc = scenario(row);
    const gain = sc.yield - row.yield;
    const gap = gapEntry().benchmark - row.yield;
    const result = el("div", { class: "result" });
    if (gain <= 0.5) {
      result.append(el("div", { class: "result-main", text: "Move a slider to see the effect" }),
        el("p", { text: "Sliders start at today's level in this district." }));
    } else {
      result.append(...[
        el("div", { class: "result-main" }, `${fmt(sc.yield)} kg/ha `, el("span", { class: "up", text: `(+${pct(100 * gain / row.yield)})` })),
        el("p", { text: `About ${fmt(gain * row.area / 1000)} t more ${cropLabel(state.crop).toLowerCase()} on today's ${fmt(row.area)} ha` +
          (gap > 0 ? `, closing ${pct(Math.min(100, 100 * gain / gap))} of the gap to the benchmark.` : ".") }),
        sc.capped ? el("p", { text: `Capped at the best district's yield (${fmt(sc.best)} kg/ha).` }) : null,
        Object.keys(state.targets).length > 1 ? el("p", { text: "Practices often go together, so combined gains may be overstated." }) : null,
      ].filter(Boolean));
    }
    return result;
  }

  function renderDistrict() {
    const panel = $("district");
    const name = state.district;
    const row = gapEntry().districts[name];
    const head = el("div", { class: "district-head" },
      el("h2", { id: "district-title", text: name }),
      el("p", { text: `${provinceLabel(provinceOf(name))} · ${cropLabel(state.crop)}, Season ${state.season} 2025` }));
    if (!row || row.yield == null || !row.reliable) {
      panel.replaceChildren(head, el("p", { class: "empty",
        text: !row || row.yield == null
          ? `NISR has no ${cropLabel(state.crop).toLowerCase()} yield estimate for ${name} this season. Pick another district on the map or in the ranking.`
          : `${name} harvested only ${fmt(row.area)} ha of ${cropLabel(state.crop).toLowerCase()} this season, too little for a reliable yield estimate. Pick another district.` }));
      return;
    }
    panel.replaceChildren(head, el("div", { class: "district-grid" },
      el("div", {},
        el("div", { class: "facts" },
          el("div", {}, el("div", { class: "fact-label", text: "Yield now" }), el("div", { class: "fact-value", text: `${fmt(row.yield)} kg/ha` })),
          el("div", {}, el("div", { class: "fact-label", text: "Gap to benchmark" }),
            el("div", { class: "fact-value", text: row.gap_pct > 0 ? pct(row.gap_pct) : "None" })),
          el("div", {}, el("div", { class: "fact-label", text: "Extra at benchmark" }),
            el("div", { class: "fact-value", text: row.extra_t > 0 ? `${fmt(row.extra_t)} t` : "–" }))),
        el("div", { id: "bullet-slot" }, bullet(row, activeScenario(row))),
        whatIf(row)),
      el("div", {}, el("h3", { text: "Farm practices, this season" }), practicesTable())));
  }

  // ---------- render ----------
  function render() {
    const entry = gapEntry();
    if (!state.picked || !state.district || !entry.districts[state.district]) {
      const top = rankedRows()[0] || reliableRows()[0];
      if (!state.picked || !state.district) state.district = top ? top.name : D.districts[0].name;
    }
    $("crop").value = state.crop;
    renderFilters();
    renderTiles();
    renderMap();
    renderRanking();
    renderTable();
    renderDistrict();
    writeHash();
  }

  $("table-toggle").addEventListener("click", (e) => {
    const view = $("table-view");
    view.hidden = !view.hidden;
    e.currentTarget.setAttribute("aria-expanded", String(!view.hidden));
    e.currentTarget.textContent = view.hidden ? "Show table" : "Hide table";
    renderTable();
  });
  $("rank-more").addEventListener("click", () => { state.showAll = !state.showAll; renderRanking(); });
  window.addEventListener("scroll", hideTip, { passive: true });

  initCropSelect();
  readHash();
  render();
})();
