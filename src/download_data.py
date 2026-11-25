"""Download the two public input files that are not stored in the repository.

  - SAS annual tables (NISR; 2025 by default) -> data/raw/sas_<year>_annual_tables.xlsx
  - Rwanda district boundaries (geoBoundaries, CC BY 4.0)
                                        -> data/raw/boundaries/geoBoundaries-RWA-ADM2_simplified.geojson

Existing files are kept unless --force is given. After this, run the pipeline in README.md.

For another survey year, pass the link of that year's "Annual Tables" workbook from the SAS page
on statistics.gov.rw, and remove the old workbook from data/raw/ (the pipeline reads the one
workbook it finds there):
    python src/download_data.py --sas-url "https://statistics.gov.rw/.../SAS%202026_Annual%20Tables.xlsx"

Usage:  python src/download_data.py [--force] [--out DIR] [--sas-url URL]
"""
import argparse
import hashlib
import re
import sys
import urllib.request
from pathlib import Path

from sas_tables import ROOT

SAS_2025_URL = "https://statistics.gov.rw/sites/default/files/documents/2025-12/SAS%202025_Annual%20Tables.xlsx"
FILES = [
    ("boundaries/geoBoundaries-RWA-ADM2_simplified.geojson",
     "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/RWA/ADM2/geoBoundaries-RWA-ADM2_simplified.geojson"),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="download again even if the file exists")
    parser.add_argument("--out", type=Path, default=ROOT / "data" / "raw", help="target folder (default: data/raw)")
    parser.add_argument("--sas-url", default=SAS_2025_URL, help="link to a SAS annual tables workbook (default: SAS 2025)")
    args = parser.parse_args()

    # Name the workbook after its year when the link shows one ("SAS%202025_..."), so the folder says which year it holds.
    year = re.search(r"SAS(?:%20|[ _-])?(20\d\d)", args.sas_url)
    sas = (f"sas_{year.group(1)}_annual_tables.xlsx" if year else "sas_annual_tables.xlsx", args.sas_url)
    for name, url in [sas] + FILES:
        target = args.out / name
        if target.exists() and not args.force:
            print(f"keep     {target}")
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(url, headers={"User-Agent": "yieldgap-rwanda/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response:
            body = response.read()
        if not body:
            sys.exit(f"empty download: {url}")
        target.write_bytes(body)
        print(f"download {target}  {len(body) / 1024:,.0f} KB  sha256 {hashlib.sha256(body).hexdigest()[:12]}")


if __name__ == "__main__":
    main()
