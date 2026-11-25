"""Shared helpers for reading a NISR Seasonal Agricultural Survey (SAS) annual tables workbook.

Nothing here is tied to one survey year. Which workbook is read:
  - the file named by the SAS_FILE environment variable, if set; otherwise
  - the one file in data/raw/ whose name looks like "sas*annual*tables*.xlsx".
Tables are found by the words in their title (see find_table), not by their number, because NISR
numbers the tables differently from one year to the next. The survey year is read from the
workbook itself (see survey_year). Output goes to data/processed/, or to YIELDGAP_OUT if set.
"""
import json
import os
import re
import warnings
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = Path(os.environ.get("YIELDGAP_OUT") or ROOT / "data" / "processed")
SURVEY = PROCESSED / "survey.json"   # year and file of the workbook the tables came from


def raw_workbook():
    if os.environ.get("SAS_FILE"):
        return Path(os.environ["SAS_FILE"])
    found = sorted((ROOT / "data" / "raw").glob("sas*annual*tables*.xlsx"))
    if len(found) != 1:
        names = ", ".join(p.name for p in found) or "none"
        raise SystemExit(f"Expected one SAS annual tables workbook in data/raw/ (found: {names}). "
                         "Keep only one there, or set SAS_FILE to the file to use.")
    return found[0]

PROVINCES = {
    "Kigali City": ["Nyarugenge", "Gasabo", "Kicukiro"],
    "Southern": ["Nyanza", "Gisagara", "Nyaruguru", "Huye", "Nyamagabe", "Ruhango", "Muhanga", "Kamonyi"],
    "Western": ["Karongi", "Rutsiro", "Rubavu", "Nyabihu", "Ngororero", "Rusizi", "Nyamasheke"],
    "Northern": ["Rulindo", "Gakenke", "Musanze", "Burera", "Gicumbi"],
    "Eastern": ["Rwamagana", "Nyagatare", "Gatsibo", "Kayonza", "Kirehe", "Ngoma", "Bugesera"],
}
DISTRICT_PROVINCE = {d: p for p, ds in PROVINCES.items() for d in ds}

# Row labels below the districts: national totals, small-scale and large-scale farmers.
SUMMARY_ROWS = {"National": "National", "Total": "National", "SSF": "Small-scale farmers", "LSF": "Large-scale farmers"}


def open_workbook():
    warnings.filterwarnings("ignore", module="openpyxl")
    return openpyxl.load_workbook(raw_workbook(), read_only=True, data_only=True)


def text(v):
    return v.strip() if isinstance(v, str) else ""


def sheet_title(ws):
    """The title text of a sheet (its first rows), lower-cased, with underscores and runs of spaces as one space."""
    cells = [text(v) for r in ws.iter_rows(values_only=True, max_row=4) for v in r if text(v)]
    return re.sub(r"\s+", " ", " ".join(cells).replace("_", " ")).lower()


def find_table(wb, words, season=None):
    """Return the one sheet whose title contains `words` (and "Season <season>", if given).

    Raises if no sheet or more than one sheet matches, so a renamed or split table is noticed
    instead of being read wrongly.
    """
    titles = getattr(wb, "_yieldgap_titles", None)
    if titles is None:
        titles = wb._yieldgap_titles = {name: sheet_title(wb[name]) for name in wb.sheetnames}
    hits = [name for name, title in titles.items()
            if words.lower() in title and (season is None or re.search(rf"\bseason {season.lower()}\b", title))]
    what = f'"{words}"' + (f" for Season {season}" if season else "")
    if len(hits) != 1:
        raise ValueError(f"Expected one table titled {what}, found {len(hits)}: {hits}. "
                         "Check the table titles in the workbook and update the search words.")
    return wb[hits[0]]


def survey_year(wb):
    """The survey year, from the contents sheet ("SAS 2025") or else from the yield table titles."""
    for name in wb.sheetnames[:2]:
        m = re.search(r"\bsas\s*(20\d\d)\b", sheet_title(wb[name]))
        if m:
            return int(m.group(1))
    m = re.search(r"\b(20\d\d)\b", sheet_title(find_table(wb, "average yield by crop", "A")))
    if not m:
        raise ValueError("Could not find the survey year in the workbook")
    return int(m.group(1))


def save_survey(wb):
    """Record which workbook and year the processed tables came from, for the later steps and the app."""
    info = {"year": survey_year(wb), "source_file": raw_workbook().name}
    PROCESSED.mkdir(parents=True, exist_ok=True)
    SURVEY.write_text(json.dumps(info, indent=1) + "\n", encoding="utf-8")
    return info


def load_survey():
    return json.loads(SURVEY.read_text(encoding="utf-8"))


def place(label):
    """Return (level, province, district) for a row label, or None for notes and headers."""
    if label in DISTRICT_PROVINCE:
        return "district", DISTRICT_PROVINCE[label], label
    if label in SUMMARY_ROWS:
        return "national", "", SUMMARY_ROWS[label]
    return None


def split_sheet(ws):
    """Split a district table into (header_rows, data_rows, label_col).

    Header rows are the rows above the first district; label_col is the column holding the
    district names. Data rows run from the first district to the end of the sheet.
    """
    rows = list(ws.iter_rows(values_only=True))
    for i, r in enumerate(rows):
        for j, v in enumerate(r):
            if text(v) in DISTRICT_PROVINCE:
                return rows[:i], rows[i:], j
    raise ValueError(f"{ws.title}: no district rows found")


def number(v):
    return float(v) if isinstance(v, (int, float)) else None


def check_districts(records, sheet):
    found = {r["district"] for r in records if r["level"] == "district"}
    if len(found) != 30:
        raise ValueError(f"{sheet}: expected 30 districts, found {len(found)}")


def shown(path):
    """A path for messages: relative to the project when inside it, else as given."""
    path = Path(path)
    return path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
