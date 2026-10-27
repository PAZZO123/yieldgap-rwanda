"""Package the processed tables and district shapes for the web app.

Writes two plain JavaScript files, so app/index.html works on any static host and when opened
straight from disk (browsers block fetch() from file:// pages):
  - app/data/app_data.js   window.APP_DATA: gaps, input use and input-yield links
  - app/data/districts.js  window.DISTRICT_SHAPES: SVG paths for the 30 districts

Reads data/processed/{yield_gaps,sas2025_district_yields,sas2025_district_inputs,input_yield_links}.csv
and data/raw/boundaries/geoBoundaries-RWA-ADM2_simplified.geojson.

Usage:  python src/build_app_data.py
"""
import csv
import json
import math
from datetime import date

from input_links import PRACTICES
from sas_tables import DISTRICT_PROVINCE, PROCESSED, ROOT
from yield_gaps import AGGREGATES, BENCHMARK_PCTL, CROPS, MIN_AREA_HA, SEASONS

APP_DATA = ROOT / "app" / "data"
BOUNDARIES = ROOT / "data" / "raw" / "boundaries" / "geoBoundaries-RWA-ADM2_simplified.geojson"
MAP_WIDTH = 600


def read(name):
    return list(csv.DictReader(open(PROCESSED / name, encoding="utf-8")))


def num(v):
    return float(v) if v not in ("", None) else None


def build_data():
    gaps = {}
    for r in read("yield_gaps.csv"):
        key = f"{r['season']}|{r['crop']}"
        entry = gaps.setdefault(key, {
            "benchmark": num(r["benchmark_kg_ha"]), "reliable_districts": int(r["reliable_districts"]),
            "districts": {},
        })
        entry["districts"][r["district"]] = {
            "yield": num(r["yield_kg_ha"]), "area": num(r["harvested_area_ha"]),
            "reliable": r["reliable"] == "True", "gap_kg": num(r["gap_kg_ha"]), "gap_pct": num(r["gap_pct"]),
            "extra_t": num(r["potential_extra_t"]), "rank": int(r["yield_rank"]) if r["yield_rank"] else None,
        }
    for r in read("sas2025_district_yields.csv"):
        key = f"{r['season']}|{r['crop']}"
        if r["district"] == "National" and key in gaps:
            gaps[key]["national_yield"] = num(r["yield_kg_ha"])
            gaps[key]["national_area"] = num(r["harvested_area_ha"])

    wanted = set(PRACTICES)
    inputs = {s: {} for s in SEASONS}
    for r in read("sas2025_district_inputs.csv"):
        if r["farmer_type"] != "Overall" or (r["practice"], r["measure"]) not in wanted:
            continue
        inputs[r["season"]].setdefault(r["district"], {})[r["practice"]] = float(r["value"])

    links = {}
    for r in read("input_yield_links.csv"):
        links.setdefault(r["crop"], []).append({
            "practice": r["practice"], "measure": r["measure"], "n": int(r["n_obs"]),
            "pooled": float(r["yield_pct_per_10pp"]),
            "ci": [float(r["ci95_low"]), float(r["ci95_high"])],
            "within": num(r["within_province_pct_per_10pp"]),
            "q": float(r["q_value"]), "evidence": r["evidence"], "use": r["use_in_scenarios"] == "True",
        })

    crops = [{"name": c, "aggregate": c in AGGREGATES, "seasons": [s for s in SEASONS if f"{s}|{c}" in gaps]}
             for c in CROPS + AGGREGATES]
    return {
        "meta": {
            "source": "NISR, Seasonal Agricultural Survey 2025 (annual tables)",
            "built": date.today().isoformat(),
            "min_area_ha": MIN_AREA_HA, "benchmark_pctl": BENCHMARK_PCTL,
        },
        "districts": [{"name": d, "province": p} for d, p in DISTRICT_PROVINCE.items()],
        "crops": [c for c in crops if c["seasons"]],
        "practices": [{"practice": p, "measure": m} for p, m in PRACTICES],
        "gaps": gaps, "inputs": inputs, "links": links,
    }


def build_shapes():
    """Project district polygons to SVG paths (equirectangular, scaled for Rwanda's latitude)."""
    features = json.load(open(BOUNDARIES, encoding="utf-8"))["features"]
    rings = {f["properties"]["shapeName"]: f["geometry"]["coordinates"] for f in features}
    if set(rings) != set(DISTRICT_PROVINCE):
        raise ValueError("boundary names do not match the SAS districts")

    pts = [p for poly in rings.values() for ring in poly for p in ring]
    lon0, lon1 = min(p[0] for p in pts), max(p[0] for p in pts)
    lat0, lat1 = min(p[1] for p in pts), max(p[1] for p in pts)
    kx = math.cos(math.radians((lat0 + lat1) / 2))
    scale = MAP_WIDTH / ((lon1 - lon0) * kx)
    height = round((lat1 - lat0) * scale)

    def xy(p):
        return round((p[0] - lon0) * kx * scale, 1), round((lat1 - p[1]) * scale, 1)

    shapes = {}
    for name, poly in rings.items():
        parts, cx, cy, n = [], 0.0, 0.0, 0
        for ring in poly:
            coords = []
            for p in map(xy, ring):
                if not coords or p != coords[-1]:  # drop points that round to the same pixel
                    coords.append(p)
            parts.append("M" + "L".join(f"{x:g},{y:g}" for x, y in coords) + "Z")
            if n == 0:
                cx, cy, n = sum(x for x, _ in coords), sum(y for _, y in coords), len(coords)
        shapes[name] = {"d": "".join(parts), "label": [round(cx / n, 1), round(cy / n, 1)]}
    return {"width": MAP_WIDTH, "height": height,
            "source": "geoBoundaries (Open Data Rwanda / NISR), CC BY 4.0", "districts": shapes}


def write_js(path, var, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"window.{var} = {json.dumps(obj, separators=(',', ':'))};\n", encoding="utf-8")
    print(f"Wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} KB)")


def main():
    write_js(APP_DATA / "app_data.js", "APP_DATA", build_data())
    write_js(APP_DATA / "districts.js", "DISTRICT_SHAPES", build_shapes())


if __name__ == "__main__":
    main()
