# AI-use disclosure

The NISR Big Data Hackathon 2026 rules allow AI tools as assistants, provided their use is
disclosed. The team stays fully responsible for the work.

## How we worked

Team The Pillars (Uwineza Gloria and Patrick Straton MBABAZI) set the direction and made the
decisions: the track, the idea, which data to use, which features to build and how the work is
published. We used Claude (Anthropic) as a coding and writing assistant. It drafted code, we did analysis
and texting and tested the results and published them.

## What the team did

| Date | Contribution |
|---|---|
| 2026-10 | Registered for the hackathon as team The Pillars |
| 2026-10-27 | Compared three candidate projects across the three tracks and chose Track 1 with the District Yield-Gap Explorer |
| 2026-10-27 | Found the data sources (the NISR SAS 2025 annual tables, and district boundaries from geoBoundaries / NISR) |
| 2026-10-27 | Created the public GitHub repository `PAZZO123/yieldgap-rwanda` and set its owner and commit identity |
| 2026-10-28 | Chose the features to add: value of extra harvest in Frw, crop priorities per district, a Kinyarwanda interface, CSV download and a printable district sheet |
| 2026-10-28 | Asked for a model and more innovation; agreed the peer-district model, the PSTA 5 target tracker, and light/dark mode |
| 2026-10-28 | Set the visual identity (Poppins font) and asked for a more interactive map |
| 2026-10-28 | Asked for a "find my district" location feature, a first-visit guide and an icon-first, low-text design |
| 2026-10-28 | Turned on GitHub Pages and published the live app |
| 2026-10-28 | Supplied the team details and reviewed the published app |
| 2026-10-28 | Asked for a review of what was missing or wrong, and chose which fixes to make (statistics, accessibility, share previews, self-hosted font, checks) |
| _pending_ | Check the Kinyarwanda interface text (`app/i18n.js`) with a fluent speaker, using the checklist in [kinyarwanda-review.md](kinyarwanda-review.md). Record here who checked it and when |
| 2026-10-28 | Asked for the figures in `docs/project-report.md` to be re-checked against the data before submitting (done by the AI assistant, see below) |

## What the AI assistant did

| Date | Tool | Assistance |
|---|---|---|
| 2026-10-27 | Claude (Anthropic) | Summarised the competition rules; drafted three project ideas per track for the team to choose from |
| 2026-10-27 | Claude (Anthropic) | Drafted the data-extraction scripts (`src/extract_*.py`, `src/sas_tables.py`) and checked them against the NISR Excel file |
| 2026-10-27 | Claude (Anthropic) | Drafted the yield-gap and input-link analysis code (`src/yield_gaps.py`, `src/input_links.py`) and `docs/methodology.md` |
| 2026-10-28 | Claude (Anthropic) | Drafted the web app (`app/`), the app data packaging and the GitHub Pages workflow |
| 2026-10-28 | Claude (Anthropic) | Drafted `docs/project-report.md` and the Kinyarwanda interface text, for the team to check |
| 2026-10-28 | Claude (Anthropic) | Drafted the code for the features the team chose: Frw values, crop priorities, district summaries, CSV/print, the peer-district model, the PSTA 5 tracker, the theme switch, the interactive map and the key insights |
| 2026-10-28 | Claude (Anthropic) | Drafted the code for the location feature, the guided tour, the icon set and the low-text layout |
| 2026-10-28 | Claude (Anthropic) | Reviewed the project and listed problems; drafted the fixes the team chose: district-clustered statistics, a nested test for the peer model, contrast and motion fixes, share-preview tags and image, self-hosted Poppins, `requirements.txt`, `NOTICE.md`, `src/download_data.py`, `tests/`, the check step before deployment and the README |
| 2026-10-28 | Claude (Anthropic) | Re-computed all 68 figures quoted in `docs/project-report.md` from the processed data (all matched), re-ran the full pipeline from the raw NISR file (every output identical), and generated the Kinyarwanda checklist `docs/kinyarwanda-review.md` from the interface text |
