# Notice: data, fonts and credits

## Data

- **Seasonal Agricultural Survey (SAS) 2025, annual tables.** National Institute of Statistics of
  Rwanda (NISR), <https://statistics.gov.rw>. Published tables used for yields, harvested area,
  input use, farm practices and crop value added (Table 8). Not redistributed here: the raw
  workbook stays out of the repository and is downloaded with `python src/download_data.py`.
  `data/processed/` holds derived tables only.
- **District boundaries.** geoBoundaries (gbOpen) Rwanda ADM2, source Open Data Rwanda / NISR,
  licensed CC BY 4.0, <https://www.geoboundaries.org>. Simplified shapes are embedded in
  `app/data/districts.js`.
- **Policy targets.** MINAGRI, *Fifth Strategic Plan for Agriculture Transformation (PSTA 5)
  2024/25–2028/29, abridged version*: the 50% productivity goal (p. 14) and the 2028/29 input
  targets (p. 22).

## Fonts

**Poppins**, Copyright 2020 The Poppins Project Authors, SIL Open Font License 1.1
(`app/fonts/OFL.txt`). The Latin subset is served from this site.

## Rights

The hackathon rules transfer intellectual property in the submitted work to NISR. This repository
therefore carries no separate software licence; the credits above apply to third-party material.

## AI assistance

AI use is disclosed in [docs/AI_USE.md](docs/AI_USE.md).
