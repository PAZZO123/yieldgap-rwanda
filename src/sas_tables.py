"""Shared helpers for reading the SAS 2025 annual tables workbook."""
import warnings
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "sas_2025_annual_tables.xlsx"
PROCESSED = ROOT / "data" / "processed"

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
    return openpyxl.load_workbook(RAW, read_only=True, data_only=True)


def text(v):
    return v.strip() if isinstance(v, str) else ""


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
