"""National crop figures for every survey year in the workbook's summary table.

The SAS annual tables open with a summary of the main indicators ("Summary of Seasonal
Agricultural Survey main indicators", Table 0 in SAS 2025) that repeats the national figures of
earlier surveys next to the current one (SAS 2023, 2024 and 2025 in the 2025 workbook). This
gives a change-over-time view from the same official file, with no other data needed.

Reads the SAS workbook in data/raw/ and writes data/processed/national_trends.csv with one row
per indicator x item (crop or input) x survey year x season.

Usage:  python src/national_trends.py
"""
import csv
import re

from sas_tables import shown, PROCESSED, ROOT, find_table, number, open_workbook, text

OUT = PROCESSED / "national_trends.csv"
TITLE = "main indicators"

# Section heading in the table -> indicator name. Values keep the table's own units.
SECTIONS = [
    ("cultivated area", "cultivated_area_ha"),
    ("harvested area", "harvested_area_ha"),
    ("production", "production_t"),
    ("yield", "yield_t_ha"),
    ("agricultural inputs", "input_use_pct_farmers"),
    ("agricultural practices", "practice_pct_farmers"),
]
# Crop names in the summary table -> the names used everywhere else in this project.
NAMES = {"taro &yams": "Yams & taro", "taro & yams": "Yams & taro", "bean": "Bean (all)", "banana": "Banana (all)"}


def columns(rows):
    """Map column index -> (survey year, season) from the "SAS yyyy" row and the A/B/C row below it."""
    year_row = next(i for i, r in enumerate(rows) if any(re.fullmatch(r"SAS\s*20\d\d", text(v)) for v in r))
    season_row = next(i for i in range(year_row + 1, len(rows))
                      if sum(text(v) in ("A", "B", "C") for v in rows[i]) >= 3)
    cols, year = {}, None
    width = max(len(rows[year_row]), len(rows[season_row]))
    for j in range(width):
        v = text(rows[year_row][j]) if j < len(rows[year_row]) else ""
        if re.fullmatch(r"SAS\s*20\d\d", v):
            year = int(v[-4:])
        s = text(rows[season_row][j]) if j < len(rows[season_row]) else ""
        if year and s in ("A", "B", "C"):
            cols[j] = (year, s)
    return cols, season_row


def main():
    rows = list(find_table(open_workbook(), TITLE).iter_rows(values_only=True))
    cols, start = columns(rows)
    label_col = min(j for r in rows[start + 1:] for j, v in enumerate(r) if text(v)) if cols else 0
    out, indicator = [], None
    for r in rows[start + 1:]:
        label = text(r[label_col]) if label_col < len(r) else ""
        if not label:
            continue
        values = {j: number(r[j]) for j in cols if j < len(r)}
        if all(v is None for v in values.values()) and all(text(r[j]) in ("", "-") for j in cols if j < len(r)):
            indicator = next((name for key, name in SECTIONS if key in label.lower()), None)
            continue  # a section heading
        if indicator is None:
            continue
        crop = NAMES.get(label.lower(), label)
        for j, (year, season) in cols.items():
            out.append({"indicator": indicator, "item": crop, "year": year, "season": season,
                        "value": "" if values.get(j) is None else round(values[j], 4)})
    if not out:
        raise ValueError("No national figures found in the summary table")
    PROCESSED.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(out[0]))
        writer.writeheader()
        writer.writerows(out)
    years = sorted({r["year"] for r in out})
    print(f"Wrote {len(out)} rows ({', '.join(map(str, years))}) to {shown(OUT)}")


if __name__ == "__main__":
    main()
