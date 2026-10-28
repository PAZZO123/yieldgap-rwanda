"""Download the two public input files that are not stored in the repository.

  - SAS 2025 annual tables (NISR)       -> data/raw/sas_2025_annual_tables.xlsx
  - Rwanda district boundaries (geoBoundaries, CC BY 4.0)
                                        -> data/raw/boundaries/geoBoundaries-RWA-ADM2_simplified.geojson

Existing files are kept unless --force is given. After this, run the pipeline in README.md.

Usage:  python src/download_data.py [--force] [--out DIR]
"""
import argparse
import hashlib
import sys
import urllib.request
from pathlib import Path

from sas_tables import ROOT

FILES = [
    ("sas_2025_annual_tables.xlsx",
     "https://statistics.gov.rw/sites/default/files/documents/2025-12/SAS%202025_Annual%20Tables.xlsx"),
    ("boundaries/geoBoundaries-RWA-ADM2_simplified.geojson",
     "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/RWA/ADM2/geoBoundaries-RWA-ADM2_simplified.geojson"),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="download again even if the file exists")
    parser.add_argument("--out", type=Path, default=ROOT / "data" / "raw", help="target folder (default: data/raw)")
    args = parser.parse_args()

    for name, url in FILES:
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
