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

## Processed files

| File | Made by | Contents |
|---|---|---|
| `data/processed/sas2025_district_yields.csv` | `python src/extract_yields.py` | Average yield (kg/ha) by season (A, B, C), district and crop, from SAS 2025 Tables 19–21. Empty yield = no estimate in the source (shown as 0 there). `level=national` rows hold the national, small-scale and large-scale farmer averages. |
