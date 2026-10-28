# Data

Raw NISR files go in `data/raw/` and are never committed (see `.gitignore`). Only small, aggregated
tables that the app needs go in `data/processed/`.

## Downloads

1. **SAS 2025 annual tables**: on the Seasonal Agricultural Survey 2025 page at
   <https://www.statistics.gov.rw/data-sources/surveys/Seasonal-Agricultural-Survey/Seasonal-Agricultural-Survey/seasonal-agricultural-survey-2025>,
   download `SAS 2025_Annual Tables.xlsx` and save it as `data/raw/sas_2025_annual_tables.xlsx`.
2. **SAS 2025 Season A report** (definitions, Table 12: average yield by crop and district):
   <https://statistics.gov.rw/sites/default/files/documents/2025-05/SAS%202025A_Final%20%20report.pdf>
3. **SAS 2025 Season B report**:
   <https://www.alpha.statistics.gov.rw/sites/default/files/documents/2025-10/SAS_2025B_Report.pdf>
4. Optional microdata (may need registration or approval): <https://microdatabk.statistics.gov.rw>.
   SAS 2025 is catalog id 124, AHS 2024 is 123, CFSVA 2024 is 122.

Record anything else you download below, with its source URL and download date.

| File | Source | Downloaded |
|---|---|---|
| `data/raw/sas_2025_annual_tables.xlsx` | <https://statistics.gov.rw/sites/default/files/documents/2025-12/SAS%202025_Annual%20Tables.xlsx> (SAS 2025 Annual Report page) | 2026-10-27 |
| `data/raw/boundaries/geoBoundaries-RWA-ADM2_simplified.geojson` | <https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/RWA/ADM2/geoBoundaries-RWA-ADM2_simplified.geojson> (geoBoundaries gbOpen, source Open Data Rwanda / NISR, CC BY 4.0) | 2026-10-27 |

## Processed files

| File | Made by | Contents |
|---|---|---|
| `data/processed/sas2025_district_yields.csv` | `python src/extract_yields.py` | Average yield (kg/ha) by season (A, B, C), district and crop, from SAS 2025 Tables 19–21, plus harvested area (ha) for Seasons A and B from Tables 16–17. Empty yield = no estimate in the source (shown as 0 there). `level=national` rows hold the national, small-scale and large-scale farmer figures. |
| `data/processed/sas2025_district_inputs.csv` | `python src/extract_inputs.py` | Seasons A and B, long format: `practice` (improved_seed, organic_fertilizer, inorganic_fertilizer, erosion_control, irrigation, mechanization, agroforestry), `measure` (farmers_pct, plots_pct, area_pct, area_ha), `farmer_type` (Overall, SSF = small-scale, LSF = large-scale), `value`, `source_table`. From Tables 11–12, 33–34, 43–44, 46–47, 64–65. |

| `data/processed/crop_values.csv` | `python src/crop_values.py` | Value added per kg for each crop (SAS Table 8 value added per ha at 2017 prices ÷ 2025 national yield). |
| `data/processed/yield_gaps.csv` | `python src/yield_gaps.py` | Benchmark, gap (kg/ha and %), potential extra tonnes and value added (Frw) per season × crop × district. See [docs/methodology.md](../docs/methodology.md). |
| `data/processed/input_yield_links.csv` | `python src/input_links.py` | Crop × practice links with yield: % per +10 pts, 95% CI (district-clustered), Spearman rho, within-province slope, q-value, evidence label. |
| `data/processed/peer_districts.csv` | `python src/peer_districts.py` | For each season × crop × district: its 4 most similar districts (crop mix + location), their yields, and the best one. |
| `data/processed/peer_model_validation.csv` | `python src/peer_districts.py` | Leave-one-out error of the peer model against the national average, per crop-season, overall, and in a nested test (settings chosen without the district being predicted). |
| `app/data/app_data.js`, `app/data/districts.js` | `python src/build_app_data.py` | The above, packed for the web app, plus district shapes as SVG paths. |

### Known quirks in the source tables

- Table 43 (Season A organic fertilizer, % of area, large-scale farmers) has values above 100% for
  Rusizi (101.7), Nyamasheke (105.2) and Rulindo (100.4). They are kept as published. Few
  large-scale farms are sampled per district, so use the `Overall` figures for district comparisons.
- Table 11 (Season A) leaves modern irrigated area blank for Karongi, Rubavu, Nyabihu, Ngororero and
  Burera. These are missing in the output, not zero.
- Table 67/68 (irrigation type) describe only plots that are already irrigated, so they are not
  extracted. Use `irrigation / farmers_pct` (Tables 64–65) or `area_ha` (Tables 11–12) for adoption.
