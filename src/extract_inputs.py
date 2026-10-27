"""Extract district input use and farm practices (Seasons A and B) from the SAS 2025 annual tables.

Reads, from data/raw/sas_2025_annual_tables.xlsx:
  - Tables 33, 34: improved seed use (% of farmers, plots, area)
  - Tables 43, 44: organic fertilizer use (% of farmers, plots, area)
  - Tables 46, 47: inorganic fertilizer use (% of farmers, plots, area)
  - Tables 64, 65: % of farmers protecting land against erosion, using machines,
                   irrigating, practising agroforestry
  - Tables 11, 12: hectares under modern irrigation, erosion control, agroforestry, fertilizer
and writes data/processed/sas2025_district_inputs.csv with one row per
season x district x practice x measure x farmer type.

Farmer types are Overall, SSF (small-scale farmers) and LSF (large-scale farmers).
Blank source cells (e.g. no large-scale farmers sampled in a district) are left out.

Usage:  python src/extract_inputs.py
"""
import csv

from sas_tables import PROCESSED, ROOT, check_districts, number, open_workbook, place, split_sheet, text

OUT = PROCESSED / "sas2025_district_inputs.csv"

# (season, sheet) for each kind of table.
PERCENT_SHEETS = [("A", "Table 33"), ("B", "Table 34"), ("A", "Table 43"), ("B", "Table 44"),
                  ("A", "Table 46"), ("B", "Table 47"), ("A", "Table 64"), ("B", "Table 65")]
AREA_SHEETS = [("A", "Table 11"), ("B", "Table 12")]

# Header text -> practice name. Order matters: "inorganic" contains "organic".
PRACTICES = [
    ("improved seed", "improved_seed"),
    ("inorganic fertilizer", "inorganic_fertilizer"),
    ("organic fertilizer", "organic_fertilizer"),
    ("erosion", "erosion_control"),
    ("mechanical", "mechanization"),
    ("irrigat", "irrigation"),
    ("agroforestry", "agroforestry"),
]
MEASURES = [("farmers", "farmers_pct"), ("plots", "plots_pct"), ("land size", "area_pct"), ("area", "area_pct")]
FARMER_TYPES = {"overall": "Overall", "ssf": "SSF", "lsf": "LSF"}


def match(header, options):
    h = header.lower()
    return next((name for key, name in options if key in h), None)


def column_labels(header_rows, label_col, width):
    """Combine the two header rows into (top, sub) per column, carrying top headings rightwards."""
    tops, subs = [""] * width, [""] * width
    *_, upper, lower = [list(r) + [None] * (width - len(r)) for r in header_rows]
    current = ""
    for j in range(width):
        if j == label_col:
            continue
        current = text(upper[j]) or current
        tops[j], subs[j] = current, text(lower[j])
    return tops, subs


def read_sheet(ws, season, area_table):
    header_rows, data_rows, label_col = split_sheet(ws)
    width = max(len(r) for r in header_rows + data_rows)
    tops, subs = column_labels(header_rows, label_col, width)

    columns = {}
    for j in range(width):
        if not tops[j]:
            continue
        if area_table:
            # Fertilizer area is split into inorganic/organic in the second header row.
            practice = match(subs[j] or tops[j], PRACTICES)
            measure, farmer_type = "area_ha", "Overall"
        else:
            practice = match(tops[j], PRACTICES)
            measure = match(tops[j], MEASURES)
            farmer_type = FARMER_TYPES.get(subs[j].lower())
        if not (practice and measure and farmer_type):
            raise ValueError(f"{ws.title}: cannot read column {j}: {tops[j]!r} / {subs[j]!r}")
        columns[j] = (practice, measure, farmer_type)

    records = []
    for r in data_rows:
        where = place(text(r[label_col]))
        if not where:
            continue
        level, province, district = where
        for j, (practice, measure, farmer_type) in columns.items():
            value = number(r[j]) if j < len(r) else None
            if value is None:
                continue
            records.append({
                "season": season, "level": level, "province": province, "district": district,
                "practice": practice, "measure": measure, "farmer_type": farmer_type,
                "value": round(value, 1), "source_table": ws.title,
            })
    check_districts(records, ws.title)
    return records


def main():
    wb = open_workbook()
    records = []
    for season, sheet in PERCENT_SHEETS:
        records += read_sheet(wb[sheet], season, area_table=False)
    for season, sheet in AREA_SHEETS:
        records += read_sheet(wb[sheet], season, area_table=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    print(f"Wrote {len(records)} rows to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
