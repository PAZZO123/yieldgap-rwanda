// Smoke checks on the web app files, no dependencies.  Run:  node tests/check_app.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const app = path.join(__dirname, "..", "app");
const read = (f) => fs.readFileSync(path.join(app, f), "utf8");
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

// Load the data and text files the way the browser does.
const win = {};
vm.createContext(win);
for (const f of ["icons.js", "i18n.js", "data/app_data.js", "data/districts.js"]) {
  vm.runInContext(read(f).replace(/^window\./gm, "this.window = this.window || this; window."), win, { filename: f });
}
const w = win.window || win;
const D = w.APP_DATA, S = w.DISTRICT_SHAPES, I = w.I18N, ICONS = w.ICONS;
check(D && S && I && ICONS, "a data file did not define its global");

// Districts and shapes agree: 30 each, same names.
const names = D.districts.map((d) => d.name);
check(names.length === 30, `expected 30 districts, found ${names.length}`);
check(JSON.stringify([...names].sort()) === JSON.stringify(Object.keys(S.districts).sort()), "district names differ between data and map shapes");
for (const [n, s] of Object.entries(S.districts)) check(s.d && s.label && s.label.length === 2, `shape for ${n} is incomplete`);
check(S.projection && S.projection.scale > 0, "map projection missing (needed by the locate button)");

// Every crop-season has a benchmark and at most 30 districts; scenario links meet the rule.
for (const [key, g] of Object.entries(D.gaps)) {
  check(g.benchmark > 0, `${key}: no benchmark`);
  check(Object.keys(g.districts).length <= 30, `${key}: more than 30 districts`);
}
for (const [crop, list] of Object.entries(D.links)) {
  for (const l of list) if (l.use) check(l.evidence === "strong" && l.pooled > 0, `${crop} ${l.practice}: used but not strong and positive`);
}
check(D.peer_model && D.peer_model.nested_error_reduction_pct != null, "peer model summary lacks the nested figure");

// Text: English and Kinyarwanda have the same keys; every key the code uses exists.
const en = Object.keys(I.en), rw = Object.keys(I.rw);
check(en.filter((k) => !rw.includes(k)).length === 0, "keys missing in Kinyarwanda: " + en.filter((k) => !rw.includes(k)).join(", "));
check(rw.filter((k) => !en.includes(k)).length === 0, "keys only in Kinyarwanda: " + rw.filter((k) => !en.includes(k)).join(", "));
const code = read("app.js"), html = read("index.html");
const used = new Set([...code.matchAll(/\bt\("([A-Za-z0-9]+)"/g)].map((m) => m[1]).concat([...html.matchAll(/data-i18n="([A-Za-z0-9]+)"/g)].map((m) => m[1])));
for (const k of used) check(en.includes(k), `text key "${k}" is used but not defined`);

// Icons used in the code exist.
const icons = new Set([...code.matchAll(/\bicon(?:Label)?\("([a-z]+)"/g)].map((m) => m[1]).concat([...code.matchAll(/icon: "([a-z]+)"/g)].map((m) => m[1])));
for (const n of icons) check(ICONS[n], `icon "${n}" is used but not defined`);

// Privacy and offline: no third-party font requests; the self-hosted fonts exist.
check(!/googleapis|gstatic/.test(html + read("styles.css") + read("fonts.css")), "page still requests Google Fonts");
for (const wgt of [400, 500, 600]) check(fs.existsSync(path.join(app, `fonts/poppins-latin-${wgt}.woff2`)), `font file ${wgt} missing`);
check(fs.existsSync(path.join(app, "og-image.png")), "og-image.png missing");
check(!/innerHTML/.test(code), "innerHTML used in app.js (use textContent / DOM methods)");

if (problems.length) { console.error(problems.length + " problem(s):\n  - " + problems.join("\n  - ")); process.exit(1); }
console.log(`app checks passed (${names.length} districts, ${Object.keys(D.gaps).length} crop-seasons, ${en.length} text keys, ${used.size} used)`);
