"""Value of a kilogram of each crop, from the SAS GVA table, so extra harvest can be shown in Frw.

The GVA table ("Main crops GVA in constant 2017 prices", Table 8 in SAS 2025) gives each main
crop's gross value added per hectare at constant 2017 prices. Dividing the survey year's value by
the crop's national yield in that year (Seasons A and B together, weighted by
harvested area) gives value added per kg. Multiplying extra kilograms by this figure gives the extra
value added, which, unlike tonnes, can be summed and compared across crops.

It is value added (output minus inputs) at 2017 prices, not today's market price, so it is a
cautious, comparable measure rather than farm-gate revenue.

Reads the SAS workbook in data/raw/, data/processed/district_yields.csv and survey.json, and
writes data/processed/crop_values.csv.

Usage:  python src/crop_values.py
"""
import csv

from sas_tables import shown, PROCESSED, ROOT, find_table, load_survey, number, open_workbook, text

YIELDS = PROCESSED / "district_yields.csv"
OUT = PROCESSED / "crop_values.csv"
GVA_TITLE = "main crops gva"   # "Main crops GVA in constant 2017 prices (Frw/ha)": Table 8 in 2025

# Table 8 row label -> crops in our tables that take its value. Table 8 has one row for beans.
TABLE8_CROPS = {
    "maize": ["Maize"], "sorghum": ["Sorghum"], "paddy rice": ["Paddy rice"], "wheat": ["Wheat"],
    "cassava": ["Cassava"], "sweet potato": ["Sweet potato"], "irish potato": ["Irish potato"],
    "cooking banana": ["Cooking banana"], "dessert banana": ["Dessert banana"],
    "banana for beer": ["Banana for beer"],
    "beans": ["Bean (all)", "Bush bean", "Climbing bean"],
    "pea": ["Pea"], "groundnut": ["Groundnut"], "soybean": ["Soybean"],
}


def read_gva(year):
    """Each crop's value added per hectare in the survey year, from the GVA table."""
    YEAR = year
    rows = list(find_table(open_workbook(), GVA_TITLE).iter_rows(values_only=True))
    year_row = next(r for r in rows if YEAR in r or str(YEAR) in [text(v) for v in r])
    col = next(j for j, v in enumerate(year_row) if v == YEAR or text(v) == str(YEAR))
    gva = {}
    for r in rows:
        label = next((text(v).lower() for v in r if text(v)), "")
        if label in TABLE8_CROPS and number(r[col]) is not None:
            gva[label] = number(r[col])
    missing = set(TABLE8_CROPS) - set(gva)
    if missing:
        raise ValueError(f"GVA table: no {YEAR} value for {sorted(missing)}")
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
    gva, yields = read_gva(load_survey()["year"]), national_yields()
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
    print(f"Wrote {len(out)} crops to {shown(OUT)}")
    for r in out:
        print(f"  {r['crop']:16} {r['gva_frw_per_ha']:>10,} Frw/ha / {r['national_yield_kg_ha']:>8,.0f} kg/ha = {r['value_frw_per_kg']:>7,.0f} Frw/kg")


if __name__ == "__main__":
    main()
