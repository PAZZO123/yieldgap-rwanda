"""Value of a kilogram of each crop, from SAS 2025 Table 8, so extra harvest can be shown in Frw.

Table 8 gives each main crop's gross value added (GVA) per hectare at constant 2017 prices.
Dividing the 2025 value by the crop's 2025 national yield (Seasons A and B together, weighted by
harvested area) gives value added per kg. Multiplying extra kilograms by this figure gives the extra
value added, which, unlike tonnes, can be summed and compared across crops.

It is value added (output minus inputs) at 2017 prices, not today's market price, so it is a
cautious, comparable measure rather than farm-gate revenue.

Reads data/raw/sas_2025_annual_tables.xlsx and data/processed/sas2025_district_yields.csv and
writes data/processed/crop_values.csv.

Usage:  python src/crop_values.py
"""
import csv

from sas_tables import PROCESSED, ROOT, number, open_workbook, text

YIELDS = PROCESSED / "sas2025_district_yields.csv"
OUT = PROCESSED / "crop_values.csv"
YEAR = 2025

# Table 8 row label -> crops in our tables that take its value. Table 8 has one row for beans.
TABLE8_CROPS = {
    "maize": ["Maize"], "sorghum": ["Sorghum"], "paddy rice": ["Paddy rice"], "wheat": ["Wheat"],
    "cassava": ["Cassava"], "sweet potato": ["Sweet potato"], "irish potato": ["Irish potato"],
    "cooking banana": ["Cooking banana"], "dessert banana": ["Dessert banana"],
    "banana for beer": ["Banana for beer"],
    "beans": ["Bean (all)", "Bush bean", "Climbing bean"],
    "pea": ["Pea"], "groundnut": ["Groundnut"], "soybean": ["Soybean"],
}


def read_gva():
    rows = list(open_workbook()["Table 8"].iter_rows(values_only=True))
    year_row = next(r for r in rows if YEAR in r or str(YEAR) in [text(v) for v in r])
    col = next(j for j, v in enumerate(year_row) if v == YEAR or text(v) == str(YEAR))
    gva = {}
    for r in rows:
        label = next((text(v).lower() for v in r if text(v)), "")
        if label in TABLE8_CROPS and number(r[col]) is not None:
            gva[label] = number(r[col])
    missing = set(TABLE8_CROPS) - set(gva)
    if missing:
        raise ValueError(f"Table 8: no {YEAR} value for {sorted(missing)}")
    return gva


def national_yields():
    """Area-weighted national yield over Seasons A and B, kg/ha."""
    totals = {}
    for r in csv.DictReader(open(YIELDS, encoding="utf-8")):
        if r["district"] != "National" or r["season"] not in "AB" or not r["yield_kg_ha"] or not r["harvested_area_ha"]:
            continue
        kg, ha = totals.get(r["crop"], (0.0, 0.0))
        area = float(r["harvested_area_ha"])
        totals[r["crop"]] = (kg + float(r["yield_kg_ha"]) * area, ha + area)
    return {crop: kg / ha for crop, (kg, ha) in totals.items() if ha}


def main():
    gva, yields = read_gva(), national_yields()
    out = []
    for label, crops in TABLE8_CROPS.items():
        # A kg of bush or climbing bean is worth the same as a kg of beans: the Table 8 row is
        # divided by the yield of its first (all-types) crop, and that value applies to every crop.
        per_kg = gva[label] / yields[crops[0]]
        for crop in crops:
            out.append({
                "crop": crop, "table8_row": label,
                "gva_frw_per_ha": round(gva[label]),
                "national_yield_kg_ha": round(yields[crops[0]], 1),
                "value_frw_per_kg": round(per_kg, 1),
            })
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(out[0]))
        writer.writeheader()
        writer.writerows(out)
    print(f"Wrote {len(out)} crops to {OUT.relative_to(ROOT)}")
    for r in out:
        print(f"  {r['crop']:16} {r['gva_frw_per_ha']:>10,} Frw/ha / {r['national_yield_kg_ha']:>8,.0f} kg/ha = {r['value_frw_per_kg']:>7,.0f} Frw/kg")


if __name__ == "__main__":
    main()
