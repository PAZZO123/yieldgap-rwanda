"""Extract district crop yields from the SAS 2025 annual tables into a tidy CSV.

Reads Tables 19, 20 and 21 (average yield by crop and district, Seasons A, B and C)
from data/raw/sas_2025_annual_tables.xlsx and writes data/processed/sas2025_district_yields.csv
with one row per season x district x crop.

A 0 in the source tables means "no estimate" (the crop was not observed in that district),
so it is written as an empty yield, not as a zero harvest.

Usage:  python src/extract_yields.py
"""
import csv
import warnings
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "sas_2025_annual_tables.xlsx"
OUT = ROOT / "data" / "processed" / "sas2025_district_yields.csv"

YIELD_SHEETS = {"A": "Table 19", "B": "Table 20", "C": "Table 21"}

PROVINCES = {
    "Kigali City": ["Nyarugenge", "Gasabo", "Kicukiro"],
    "Southern": ["Nyanza", "Gisagara", "Nyaruguru", "Huye", "Nyamagabe", "Ruhango", "Muhanga", "Kamonyi"],
    "Western": ["Karongi", "Rutsiro", "Rubavu", "Nyabihu", "Ngororero", "Rusizi", "Nyamasheke"],
    "Northern": ["Rulindo", "Gakenke", "Musanze", "Burera", "Gicumbi"],
    "Eastern": ["Rwamagana", "Nyagatare", "Gatsibo", "Kayonza", "Kirehe", "Ngoma", "Bugesera"],
}
DISTRICT_PROVINCE = {d: p for p, ds in PROVINCES.items() for d in ds}

# Row labels below the districts: national totals, small-scale and large-scale farmers.
SUMMARY_ROWS = {"National": "National", "SSF": "Small-scale farmers", "LSF": "Large-scale farmers"}

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
# Group headings carry no values in the yield tables.
GROUP_HEADERS = {"cereals", "tubers and roots", "legumes and pulses", "vegetables and fruits"}


def read_yield_sheet(ws, season):
    rows = list(ws.iter_rows(values_only=True))
    header_idx = next(
        i for i, r in enumerate(rows)
        if any(isinstance(v, str) and v.strip().lower().startswith("district") for v in r)
    )
    header = rows[header_idx]
    label_col = next(
        j for j, v in enumerate(header) if isinstance(v, str) and v.strip().lower().startswith("district")
    )

    crop_cols = {}
    for j, v in enumerate(header):
        if j == label_col or not isinstance(v, str):
            continue
        key = v.strip().lower()
        if key in GROUP_HEADERS:
            continue
        if key not in CROPS:
            raise ValueError(f"{ws.title}: unknown crop column {v!r}")
        crop_cols[j] = CROPS[key]

    records = []
    for r in rows[header_idx + 1:]:
        label = r[label_col].strip() if isinstance(r[label_col], str) else None
        if not label:
            continue
        if label in DISTRICT_PROVINCE:
            district, province, level = label, DISTRICT_PROVINCE[label], "district"
        elif label in SUMMARY_ROWS:
            district, province, level = SUMMARY_ROWS[label], "", "national"
        else:
            continue  # source notes and blank lines
        for j, (crop, group) in crop_cols.items():
            v = r[j] if j < len(r) else None
            value = round(float(v), 1) if isinstance(v, (int, float)) and v > 0 else ""
            records.append({
                "season": season, "level": level, "province": province, "district": district,
                "crop_group": group, "crop": crop, "yield_kg_ha": value,
            })
    return records


def main():
    warnings.filterwarnings("ignore", module="openpyxl")
    wb = openpyxl.load_workbook(RAW, read_only=True, data_only=True)
    records = []
    for season, sheet in YIELD_SHEETS.items():
        season_records = read_yield_sheet(wb[sheet], season)
        districts = {r["district"] for r in season_records if r["level"] == "district"}
        if len(districts) != 30:
            raise ValueError(f"{sheet}: expected 30 districts, found {len(districts)}")
        records += season_records

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    with_value = sum(1 for r in records if r["yield_kg_ha"] != "")
    print(f"Wrote {len(records)} rows ({with_value} with a yield) to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
