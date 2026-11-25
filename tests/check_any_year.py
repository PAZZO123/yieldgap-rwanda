"""Check that the pipeline works on another year's SAS workbook, not only on SAS 2025.

NISR renumbers its tables and changes the year from one survey to the next. This test makes a
copy of the workbook in data/raw/ that looks like a different year: every table gets a new number,
the sheets are put in a different order, and the survey year is changed everywhere (2025 -> 2031,
so an older value can't be picked up by accident). It then runs the extraction and analysis on
the copy, in a temporary folder, and checks that:
  - the survey year is read from the file (2031),
  - every district table gives exactly the same numbers as the real run in data/processed/.

The raw workbook is not in the repository (see data/README.md), so the test is skipped when it is
missing. Run it after downloading the data:  python tests/check_any_year.py
"""
import csv
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from sas_tables import raw_workbook  # noqa: E402

STEPS = ["extract_yields", "extract_inputs", "crop_values", "national_trends", "yield_gaps", "input_links",
         "peer_districts"]
OLD, NEW = "2025", "2031"
# Outputs that must be identical; source_table names the sheet, which is renumbered on purpose.
SAME = {"district_yields.csv": [], "district_inputs.csv": ["source_table"], "crop_values.csv": [],
        "yield_gaps.csv": [], "input_yield_links.csv": [], "peer_districts.csv": [],
        "peer_model_validation.csv": []}


def renumber(s):
    return re.sub(r"\bTable (\d+)", lambda m: f"Table {int(m.group(1)) + 7}", s)


def disguise(src, dst):
    """Copy the workbook with new table numbers, a new sheet order and a new survey year.

    The .xlsx XML is edited directly, so every number stays exactly as NISR stored it (re-saving
    with a spreadsheet library can shorten long decimals and change how they round).
    """
    text_in = lambda xml: re.sub(r"(<t[^>]*>)([^<]*)(</t>)", lambda m: m.group(1) + renumber(m.group(2).replace(OLD, NEW)) + m.group(3), xml)
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "xl/workbook.xml":
                xml = renumber(data.decode("utf-8"))                       # sheet names and defined names
                m = re.search(r"<sheets>(.*?)</sheets>", xml, re.S)
                sheets = re.findall(r"<sheet\b[^>]*/>", m.group(1))
                xml = xml[:m.start(1)] + sheets[0] + "".join(sheets[1:][::-1]) + xml[m.end(1):]   # reversed order
                data = xml.encode("utf-8")
            elif item.filename == "xl/sharedStrings.xml" or item.filename.startswith("xl/worksheets/sheet"):
                xml = text_in(data.decode("utf-8"))                        # titles and labels
                # The year written as a number (GVA table header). Only cells without a t= type hold
                # numbers; in text cells <v> is an index into the shared strings and must not change.
                xml = re.sub(rf"(<c\b(?:(?!t=)[^>])*>)<v>{OLD}</v>", rf"\g<1><v>{NEW}</v>", xml)
                data = xml.encode("utf-8")
            zout.writestr(item, data)


def read(path, drop):
    with open(path, encoding="utf-8") as f:
        return [{k: v for k, v in r.items() if k not in drop} for r in csv.DictReader(f)]


def main():
    try:
        src = raw_workbook()
    except SystemExit:
        print("any-year check skipped: no SAS workbook in data/raw/ (see data/README.md)")
        return
    with tempfile.TemporaryDirectory() as tmp:
        fake = Path(tmp) / f"sas_{NEW}_annual_tables.xlsx"
        out = Path(tmp) / "processed"
        disguise(src, fake)
        env = {**os.environ, "SAS_FILE": str(fake), "YIELDGAP_OUT": str(out), "PYTHONIOENCODING": "utf-8"}
        for step in STEPS:
            run = subprocess.run([sys.executable, str(ROOT / "src" / f"{step}.py")], env=env, cwd=ROOT,
                                 capture_output=True, text=True)
            if run.returncode:
                sys.exit(f"any-year check FAILED in {step}.py:\n{run.stdout}{run.stderr}")

        problems = []
        survey = json.loads((out / "survey.json").read_text(encoding="utf-8"))
        if survey["year"] != int(NEW):
            problems.append(f"survey year read as {survey['year']}, expected {NEW}")
        for name, drop in SAME.items():
            if read(out / name, drop) != read(ROOT / "data" / "processed" / name, drop):
                problems.append(f"{name} differs from the real run")
        years = {r["year"] for r in read(out / "national_trends.csv", [])}
        if NEW not in years or OLD in years:
            problems.append(f"national_trends.csv years are {sorted(years)}, expected the new year {NEW}")
    if problems:
        sys.exit("any-year check FAILED:\n  - " + "\n  - ".join(problems))
    print(f"any-year check passed: renumbered, reordered SAS {NEW} copy gives the same results "
          f"({len(SAME)} tables compared)")


if __name__ == "__main__":
    main()
