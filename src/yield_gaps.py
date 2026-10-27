"""Benchmark yield gaps per district and crop, Seasons A and B 2025.

For every crop and season, the benchmark is the top-quartile (75th percentile) yield among
districts with a reliable estimate (harvested area >= MIN_AREA_HA). Each district's gap is how
far its yield falls below that benchmark, in kg/ha and as a share of the benchmark, and the
extra production it would get on its current harvested area if it reached the benchmark.

Reads data/processed/sas2025_district_yields.csv and writes data/processed/yield_gaps.csv.

Usage:  python src/yield_gaps.py
"""
import csv

import numpy as np

from sas_tables import PROCESSED, ROOT

YIELDS = PROCESSED / "sas2025_district_yields.csv"
OUT = PROCESSED / "yield_gaps.csv"

SEASONS = ("A", "B")
MIN_AREA_HA = 200      # below this, district yield estimates are too noisy to compare
MIN_DISTRICTS = 8      # reliable districts needed before a benchmark is set
BENCHMARK_PCTL = 75

# Single crops with comparable yields across districts. Mixed categories (other crops, fodder,
# fruits, vegetables, other cereals) lump different plants together and are left out.
CROPS = [
    "Maize", "Sorghum", "Paddy rice", "Wheat",
    "Cassava", "Sweet potato", "Irish potato", "Yams & taro",
    "Cooking banana", "Dessert banana", "Banana for beer",
    "Bush bean", "Climbing bean", "Pea", "Groundnut", "Soybean",
]
# Sums of the crops above: kept for display, never added into totals.
AGGREGATES = ["Bean (all)", "Banana (all)"]


def load_yields():
    rows = []
    for r in csv.DictReader(open(YIELDS, encoding="utf-8")):
        if r["level"] != "district" or r["season"] not in SEASONS or r["crop"] not in CROPS + AGGREGATES:
            continue
        if not r["yield_kg_ha"]:
            continue
        r["yield_kg_ha"] = float(r["yield_kg_ha"])
        r["harvested_area_ha"] = float(r["harvested_area_ha"] or 0)
        r["reliable"] = r["harvested_area_ha"] >= MIN_AREA_HA
        rows.append(r)
    return rows


def main():
    rows = load_yields()
    out = []
    for season in SEASONS:
        for crop in CROPS + AGGREGATES:
            group = [r for r in rows if r["season"] == season and r["crop"] == crop]
            reliable = [r["yield_kg_ha"] for r in group if r["reliable"]]
            if len(reliable) < MIN_DISTRICTS:
                continue
            benchmark = float(np.percentile(reliable, BENCHMARK_PCTL))
            ranked = sorted((r for r in group if r["reliable"]), key=lambda r: r["yield_kg_ha"], reverse=True)
            rank = {r["district"]: i for i, r in enumerate(ranked, 1)}
            for r in group:
                gap = max(0.0, benchmark - r["yield_kg_ha"])
                out.append({
                    "season": season, "crop": crop, "is_aggregate": crop in AGGREGATES,
                    "province": r["province"], "district": r["district"],
                    "yield_kg_ha": round(r["yield_kg_ha"], 1),
                    "harvested_area_ha": round(r["harvested_area_ha"], 1),
                    "reliable": r["reliable"],
                    "benchmark_kg_ha": round(benchmark, 1),
                    "gap_kg_ha": round(gap, 1),
                    "gap_pct": round(100 * gap / benchmark, 1),
                    # Only reliable estimates count toward potential production.
                    "potential_extra_t": round(gap * r["harvested_area_ha"] / 1000, 1) if r["reliable"] else "",
                    "yield_rank": rank.get(r["district"], ""),
                    "reliable_districts": len(reliable),
                })

    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(out[0]))
        writer.writeheader()
        writer.writerows(out)
    print(f"Wrote {len(out)} rows to {OUT.relative_to(ROOT)}")

    for season in SEASONS:
        # Tonnes are not summed across crops: fresh roots and dry grain are not comparable.
        single = [r for r in out if r["season"] == season and not r["is_aggregate"] and r["potential_extra_t"] != ""]
        print(f"\nSeason {season}: extra production if every district reached the benchmark (top 6 crops)")
        by_crop = {}
        for r in single:
            by_crop[r["crop"]] = by_crop.get(r["crop"], 0) + r["potential_extra_t"]
        for crop, t in sorted(by_crop.items(), key=lambda kv: -kv[1])[:6]:
            top = max((r for r in single if r["crop"] == crop), key=lambda r: r["potential_extra_t"])
            print(f"  {crop:15} {t:9,.0f} t   biggest: {top['district']} ({top['potential_extra_t']:,.0f} t, "
                  f"gap {top['gap_pct']:.0f}%)")


if __name__ == "__main__":
    main()
