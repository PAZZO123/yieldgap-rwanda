# District Yield-Gap Explorer

**NISR Big Data Hackathon 2026, Track 1: Agricultural Productivity · Team The Pillars**

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

## Team: The Pillars

- Uwineza Gloria ([@uwinezagloria](https://github.com/uwinezagloria))
- Patrick Straton MBABAZI ([@PAZZO123](https://github.com/PAZZO123))

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
python src/crop_values.py
python src/yield_gaps.py
python src/input_links.py
python src/peer_districts.py
python src/build_app_data.py
```

## Web app

**Live:** <https://pazzo123.github.io/yieldgap-rwanda/>

A static site in `app/` (plain HTML, CSS and JavaScript, with no build step or libraries):

- **Typeface:** Poppins (Google Fonts), falling back to the device's sans-serif font if it can't
  load.
- **Light, dark or automatic theme:** a switch in the header, remembered between visits. Printing
  always uses light colors.
- **English and Kinyarwanda:** a language switch for the whole interface, remembered between
  visits and shareable with `?lang=rw`. All text is in [app/i18n.js](app/i18n.js). The Kinyarwanda
  was drafted with AI help and should be checked by a fluent speaker.
- **Filters:** season, crop, and whether districts are ranked by extra harvest or gap %.
- **Summary tiles:** extra harvest possible (in tonnes and Frw value added), benchmark yield,
  national average, districts below the benchmark.
- **First-visit guide:** a 7-step spotlight tour, each step an icon, a 2–4 word title and one
  short line. The "?" button replays it.
- **Find my district (📍):** uses the phone's location to find the district you are standing in,
  drops a "you are here" pin, zooms there and opens that district's statistics. The position is
  matched to a district on the device and never sent anywhere.
- **Icon-first design:** icons for zoom, locate, share, print, download, table, theme (auto, sun,
  moon) and help, with the method notes folded into a "How it works" section.
- **Key insights:** four findings computed from the data (the biggest national prize, the biggest
  single-district opportunity, the district furthest from the fertilizer target, and where similar
  districts teach most). Each "Show me" button jumps to the view that shows it.
- **Interactive district map:**
  - shade it by gap to the benchmark, gap to similar districts, yield, extra harvest or value;
  - zoom with the buttons, pinch, or Ctrl + scroll (trackpad pinch works too); drag to move;
  - "zoom to district" and "show all of Rwanda" buttons;
  - a district search box and district name labels;
  - hover or tap details, a table view and **CSV download**.
- **Ranking:** where closing the gap adds the most food.
- **Crop priorities:** for the selected district, or all of Rwanda, every crop and season ranked
  by the **value added (Frw)** that closing the gap would bring, so different crops can be
  compared. Select a row to explore that crop. Downloadable as CSV.
- **District panel:**
  - an automatically written **"In brief" summary**: yield, gap, extra harvest and value, rank,
    the clearest practice lever, and the district's biggest opportunity across all crops;
  - yield against the benchmark;
  - farm-practice adoption against Rwanda;
  - a **what-if** panel. Sliders raise a practice up to the highest level any district reached.
    Only practices with a strong, positive link that holds within provinces are used, and the
    smaller estimate is applied;
  - **similar districts:** the 4 districts farming under the most similar conditions, from a
    nearest-neighbour model (crop mix + location, tuned by leave-one-out validation). They are
    outlined on the map, the best one's practices appear next to this district's, and a model
    check says whether peers predict this crop's yields better than the national average;
  - a **PSTA 5 target tracker:** the share of small-scale farmers using improved seed and mineral
    fertilizer against the 2028/29 targets (50% and 66.5%).
- **Share:** copies a link to the exact view, or opens the phone's share menu.
- **Print district sheet:** a clean one-page printout of the district's summary, crop priorities
  and practices, for meetings.

The page state is kept in the URL (e.g. `#B/Cassava/Rusizi`), so views can be shared.

Run locally: open `app/index.html` in a browser, or serve the folder with any static server
(e.g. `npx serve app`).
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
