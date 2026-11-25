"""Extract district crop yields and harvested area from a SAS annual tables workbook into a tidy CSV.

Reads, from the SAS workbook in data/raw/ (any survey year; tables are found by their titles):
  - "Average yield by crop type and district (Kg/Ha)", Seasons A, B and C (Tables 19-21 in 2025)
  - "Harvested area by crop type and district (Ha)", Seasons A and B (Tables 16-17 in 2025)
and writes data/processed/district_yields.csv with one row per season x district x crop, plus
data/processed/survey.json with the survey year and the workbook name.

A 0 yield in the source means "no estimate" (the crop was not observed in that district),
so it is written as an empty yield, not as a zero harvest. A 0 harvested area is kept as 0.

Usage:  python src/extract_yields.py
"""
import csv

from sas_tables import (shown, PROCESSED, ROOT, check_districts, find_table, number, open_workbook, place, save_survey,
                        split_sheet, text)

OUT = PROCESSED / "district_yields.csv"

YIELD_TITLE = "average yield by crop"     # + "Season A/B/C"
AREA_TITLE = "harvested area by crop"     # + "Season A/B"
YIELD_SEASONS, AREA_SEASONS = ("A", "B", "C"), ("A", "B")

# Spelling differs between seasons; map every header to one crop name and its group.
CROPS = {
    "maize": ("Maize", "Cereals"),
    "sorghum": ("Sorghum", "Cereals"),
    "paddy rice": ("Paddy rice", "Cereals"),
    "wheat": ("Wheat", "Cereals"),
    "other cereals": ("Other cereals", "Cereals"),
    "cassava": ("Cassava", "Tubers and roots"),
    "sweet potato": ("Sweet potato", "Tubers and roots"),
    "sweet potatoes": ("Sweet potato", "Tubers and roots"),
    "irish potato": ("Irish potato", "Tubers and roots"),
    "irish potatoes": ("Irish potato", "Tubers and roots"),
    "yams & taro": ("Yams & taro", "Tubers and roots"),
    "banana": ("Banana (all)", "Banana"),
    "cooking banana": ("Cooking banana", "Banana"),
    "dessert banana": ("Dessert banana", "Banana"),
    "banana for beer": ("Banana for beer", "Banana"),
    "bean": ("Bean (all)", "Legumes and pulses"),
    "beans": ("Bean (all)", "Legumes and pulses"),
    "bush bean": ("Bush bean", "Legumes and pulses"),
    "climbing bean": ("Climbing bean", "Legumes and pulses"),
    "pea": ("Pea", "Legumes and pulses"),
    "peas": ("Pea", "Legumes and pulses"),
    "groundnut": ("Groundnut", "Legumes and pulses"),
    "groundnuts": ("Groundnut", "Legumes and pulses"),
    "soybean": ("Soybean", "Legumes and pulses"),
    "vegetables": ("Vegetables", "Vegetables and fruits"),
    "fruits": ("Fruits", "Vegetables and fruits"),
    "fodder crops": ("Fodder crops", "Other"),
    "other crops": ("Other crops", "Other"),
}
# Group headings and totals: empty in the yield tables, sums in the area tables. Not crops.
NOT_CROPS = {"cereals", "tubers and roots", "legumes and pulses", "vegetables and fruits", "total developed land"}


def read_crop_sheet(ws):
    """Yield {(level, province, district, crop, crop_group): value} for one crop x district table."""
    header_rows, data_rows, label_col = split_sheet(ws)
    header = next(r for r in reversed(header_rows) if text(r[label_col]).lower().startswith("district"))

    crop_cols = {}
    for j, v in enumerate(header):
        key = text(v).lower()
        if j == label_col or not key or key in NOT_CROPS:
            continue
        if key not in CROPS:
            raise ValueError(f"{ws.title}: unknown crop column {v!r}")
        crop_cols[j] = CROPS[key]

    values = {}
    for r in data_rows:
        where = place(text(r[label_col]))
        if not where:
            continue  # source notes and blank lines
        for j, (crop, group) in crop_cols.items():
            values[(*where, crop, group)] = number(r[j]) if j < len(r) else None
    return values


def main():
    wb = open_workbook()
    survey = save_survey(wb)
    records = []
    for season in YIELD_SEASONS:
        ws = find_table(wb, YIELD_TITLE, season)
        sheet = ws.title
        yields = read_crop_sheet(ws)
        areas = read_crop_sheet(find_table(wb, AREA_TITLE, season)) if season in AREA_SEASONS else {}
        season_records = []
        for key, y in yields.items():
            level, province, district, crop, group = key
            area = areas.get(key)
            season_records.append({
                "season": season, "level": level, "province": province, "district": district,
                "crop_group": group, "crop": crop,
                "yield_kg_ha": round(y, 1) if y and y > 0 else "",
                "harvested_area_ha": round(area, 1) if area is not None else "",
            })
        check_districts(season_records, sheet)
        records += season_records

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    with_yield = sum(1 for r in records if r["yield_kg_ha"] != "")
    with_area = sum(1 for r in records if r["harvested_area_ha"] != "")
    print(f"SAS {survey['year']} ({survey['source_file']})")
    print(f"Wrote {len(records)} rows ({with_yield} with a yield, {with_area} with harvested area) "
          f"to {shown(OUT)}")


if __name__ == "__main__":
    main()
