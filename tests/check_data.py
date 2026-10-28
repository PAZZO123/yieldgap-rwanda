"""Consistency checks on the processed tables (no raw NISR files needed).

Run:  python tests/check_data.py
Exits with a non-zero status and a list of problems if any check fails.
"""
import csv
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

PROCESSED = Path(__file__).resolve().parent.parent / "data" / "processed"
problems = []


def check(condition, message):
    if not condition:
        problems.append(message)


def rows(name):
    return list(csv.DictReader(open(PROCESSED / name, encoding="utf-8")))


# ---- district yields: 30 districts per season, positive yields ----
yields = rows("sas2025_district_yields.csv")
for season in "ABC":
    districts = {r["district"] for r in yields if r["season"] == season and r["level"] == "district"}
    check(len(districts) == 30, f"yields: season {season} has {len(districts)} districts, expected 30")
check(all(float(r["yield_kg_ha"]) > 0 for r in yields if r["yield_kg_ha"]), "yields: non-positive yield found")

# ---- yield gaps: benchmark, gap and extra harvest recompute exactly ----
gaps = rows("yield_gaps.csv")
groups = defaultdict(list)
for r in gaps:
    groups[(r["season"], r["crop"])].append(r)
for (season, crop), members in groups.items():
    reliable = [float(r["yield_kg_ha"]) for r in members if r["reliable"] == "True"]
    benchmark = float(members[0]["benchmark_kg_ha"])
    check(len(members) <= 30, f"gaps: {season} {crop} has {len(members)} districts")
    check(len(reliable) >= 8, f"gaps: {season} {crop} benchmark set with only {len(reliable)} reliable districts")
    check(abs(np.percentile(reliable, 75) - benchmark) < 0.11, f"gaps: {season} {crop} benchmark is not the 75th percentile")
    for r in members:
        gap, area, y = float(r["gap_kg_ha"]), float(r["harvested_area_ha"]), float(r["yield_kg_ha"])
        check(gap >= 0, f"gaps: negative gap {season} {crop} {r['district']}")
        check(abs(gap - max(0, benchmark - y)) < 0.11, f"gaps: gap mismatch {season} {crop} {r['district']}")
        if r["reliable"] == "True":
            check(area >= 200, f"gaps: reliable estimate with area {area} ha ({season} {crop} {r['district']})")
            # gap and area are stored rounded to 0.1, so the product can differ by their rounding error.
            tolerance = (0.05 * area + 0.05 * gap) / 1000 + 0.06
            check(abs(float(r["potential_extra_t"]) - gap * area / 1000) <= tolerance, f"gaps: extra tonnes mismatch {season} {crop} {r['district']}")
        else:
            check(r["potential_extra_t"] == "" and r["potential_extra_value_frw"] == "", f"gaps: unreliable row has extra harvest ({season} {crop} {r['district']})")

# ---- practice links: the what-if rule is applied as documented ----
links = rows("input_yield_links.csv")
check(len(links) > 0, "links: empty")
for r in links:
    q = float(r["q_value"])
    check(0 <= q <= 1, f"links: q out of range for {r['crop']} {r['practice']}")
    check(int(r["n_districts"]) >= 12, f"links: {r['crop']} {r['practice']} has only {r['n_districts']} districts")
    if r["use_in_scenarios"] == "True":
        pooled, within = float(r["yield_pct_per_10pp"]), float(r["within_province_pct_per_10pp"])
        check(r["evidence"] == "strong" and pooled > 0 and within >= 0.5 * pooled,
              f"links: {r['crop']} {r['practice']} is used in scenarios but does not meet the rule")

# ---- peers: never themselves, right count, nested validation present ----
for r in rows("peer_districts.csv"):
    peers = r["peers"].split(";")
    check(r["district"] not in peers, f"peers: {r['district']} is its own peer")
    check(1 <= len(peers) <= 8, f"peers: {r['district']} has {len(peers)} peers")
validation = rows("peer_model_validation.csv")
check(any(v["season"] == "nested" for v in validation), "peer validation: nested row missing")

# ---- crop values: positive, one per crop ----
values = rows("crop_values.csv")
check(all(float(v["value_frw_per_kg"]) > 0 for v in values), "crop values: non-positive value")
check(len({v["crop"] for v in values}) == len(values), "crop values: duplicate crop")

if problems:
    print(f"{len(problems)} problem(s):", *problems[:40], sep="\n  - ")
    sys.exit(1)
print(f"data checks passed ({len(gaps)} gap rows, {len(links)} links, {len(groups)} crop-seasons)")
