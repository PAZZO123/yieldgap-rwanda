# District Yield-Gap Explorer

**NISR Big Data Hackathon 2026, Track 1: Agricultural Productivity**

An interactive web app that shows, for every district and major crop in Rwanda, how far yields fall
short of the best-performing districts, and which farm practices (improved seed, fertilizer,
irrigation, erosion control) are linked to closing that gap. It is meant for district agronomists,
cooperatives and planners deciding where to put extension and input support.

## Competition

| | |
|---|---|
| Organiser | National Institute of Statistics of Rwanda (NISR) |
| Competition page | <https://statistics.gov.rw/about/hackathon/2026-hackathon-competition> |
| Submission form | <https://statistics.gov.rw/form/2026-hackathon-submission-form> |
| **Submission deadline** | **30 October 2026, 11:59 PM** |
| Deliverables | Public GitHub repo, deployed app link, documentation |
| Shortlist / coaching | 13 Nov 2026 / 16 Nov – 4 Dec 2026 |

Judging (20 points each): problem understanding and NST2/Vision 2050 relevance, data use and
methodology, technical innovation, usability and design, tangible impact.

## Team

- _Full name TBC_ (ndinayoeric151@gmail.com)
- _Full name TBC_ ([@uwinezagloria](https://github.com/uwinezagloria), gloria7wineza@gmail.com)

## Problem

NST2 aims to raise agricultural productivity, but yields for the same crop differ widely between
districts and seasons. Planners need a quick way to see where the gaps are largest and which
practices those gaps are linked to, so support goes where it pays off most.

## Plan

1. **Data (Day 1).** Download the SAS 2025 annual tables, then extract district × crop × season
   yields and input-use rates into tidy CSVs (`src/`, output to `data/processed/`).
2. **Analysis (Day 1–2).** Compute each district's yield gap against a benchmark (top-quartile
   district) for each crop and season. Estimate how input adoption relates to yield across districts
   and seasons, and report uncertainty and limitations honestly (`notebooks/`).
3. **App (Day 2–3).** Build a district map plus a crop selector, a gap ranking and a
   "what if adoption rose to X%" scenario panel. Deploy as a static site (`app/`).
4. **Docs and submission (Day 3).** Methodology, data sources, AI-use disclosure, then submit the form.

## Data sources

| Dataset | Use | Access |
|---|---|---|
| Seasonal Agricultural Survey (SAS) 2025, annual tables (`SAS 2025_Annual Tables.xlsx`) | Yields, cultivated area, input use by district and season | Public, statistics.gov.rw |
| SAS 2025 Season A and Season B reports | Definitions, district yield tables | Public PDF |
| Agriculture Household Survey 2024, CFSVA 2024 (optional) | Context: food security, post-harvest | NISR microdata catalog |
| District boundaries (geoBoundaries RWA ADM2, from Open Data Rwanda / NISR) | App map | Public, CC BY 4.0 |

See [data/README.md](data/README.md) for download steps. Raw files are **not** committed.

## Documentation

- [docs/project-report.md](docs/project-report.md): the submission write-up (problem, NST2/PSTA 5
  relevance, users, method, findings, impact, limitations)
- [docs/methodology.md](docs/methodology.md): methods and results in detail
- [docs/AI_USE.md](docs/AI_USE.md): AI-use disclosure

## Analysis

Methods, first results and limitations are in [docs/methodology.md](docs/methodology.md).
To rebuild all processed tables and the app's data from the raw files (Python 3 with `openpyxl`,
`numpy`, `scipy`):

```
python src/extract_yields.py
python src/extract_inputs.py
python src/yield_gaps.py
python src/input_links.py
python src/build_app_data.py
```

## Web app

**Live:** <https://pazzo123.github.io/yieldgap-rwanda/>

A static site in `app/` (plain HTML, CSS and JavaScript, with no build step or libraries):

- **Filters:** season, crop, and whether districts are ranked by extra harvest or gap %.
- **Summary tiles:** benchmark yield, national average, extra harvest possible, districts below
  the benchmark.
- **District map:** shaded by gap to the benchmark, with hover/tap details and a table view.
- **Ranking:** where closing the gap adds the most food.
- **District panel:** yield against the benchmark, farm-practice adoption against Rwanda, and a
  **what-if** panel. Sliders raise a practice up to the highest level any district reached. Only
  practices with a strong, positive link that holds within provinces are used, and the smaller
  estimate is applied.

The page state is kept in the URL (e.g. `#B/Cassava/Rusizi`), so views can be shared.

Run locally: open `app/index.html` in a browser, or `python -m http.server -d app 8000`.
Every push to `main` deploys `app/` through [.github/workflows/pages.yml](.github/workflows/pages.yml).
This needs a one-time setting on GitHub: Settings → Pages → Source: **GitHub Actions**.

## Repository layout

```
data/raw/        downloaded NISR files (git-ignored)
data/processed/  small tidy tables the app reads (committed)
notebooks/       exploration and analysis
src/             data extraction and cleaning scripts
app/             web app (deployed)
docs/            methodology, AI-use disclosure, submission notes
```

## AI use

AI tools were used as assistants in this project. Details are in [docs/AI_USE.md](docs/AI_USE.md),
as the competition rules require.

## Intellectual property

By entering the hackathon, the team assigns all intellectual property rights in this work to NISR.
