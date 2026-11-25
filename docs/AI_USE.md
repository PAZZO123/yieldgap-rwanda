# AI-use disclosure

The NISR Big Data Hackathon 2026 rules allow AI tools as assistants, provided their use is
disclosed. The team stays fully responsible for the work.

## In short

Team The Pillars (Uwineza Gloria and Patrick Straton MBABAZI) set the direction and made the
decisions: the track, the idea, which data to use, which features to build, the design and how the
work is published. We reviewed, wrote and tested the code (most of it first drafted by the AI), checked the numbers against NISR's
tables and wrote the documents.

We used Claude (Anthropic) as an assistant, to work faster, for two things:

1. **Drafting the code**, including the test scripts, which we then reviewed, edited and ran.
2. **Generating the Kinyarwanda translations** of the interface. They have not yet been checked by a
   fluent speaker (see below).

The voice in our demo video is synthetic (AI-generated); the app says so next to the video.

There is no AI inside the app: no chatbot, no generated answers. Its results come from statistics
on NISR data and one machine-learning model (nearest neighbours) that we tested.

## What the team did

| Date | Contribution |
|---|---|
| 2026-10 | Registered for the hackathon as team The Pillars |
| 2026-10-27 | Compared three candidate projects across the three tracks and chose Track 1 with the District Yield-Gap Explorer |
| 2026-10-27 | Found the data sources (the NISR SAS 2025 annual tables, and district boundaries from geoBoundaries / NISR) |
| 2026-10-27 | Created the public GitHub repository `PAZZO123/yieldgap-rwanda` and set its owner and commit identity |
| 2026-10-28 | Chose the features: value of the harvest gap in Frw, crop priorities per district, a Kinyarwanda interface, CSV download and a printable district sheet |
| 2026-10-28 | Chose the peer-district model, the PSTA 5 target tracker, and light/dark mode |
| 2026-10-28 | Set the visual identity (Poppins font) and the interactive map |
| 2026-10-28 | Chose the "find my district" location feature, a first-visit guide and an icon-first, low-text design |
| 2026-10-28 | Deployed the app: turned on GitHub Pages and published the live app |
| 2026-10-28 | Reviewed what was missing or wrong, and chose which fixes to make (statistics, accessibility, share previews, self-hosted font, checks) |
| 2026-10-28 | Wrote `docs/methodology.md` and `docs/project-report.md`, and re-checked the report's figures against the data |
| 2026-10-28 | Reviewed, wrote and tested the code: the data checks (`tests/check_data.py`), the app checks (`tests/check_app.js`) and the app itself |
| 2026-10-29 | Acted on a reviewer's comment that the site looked like a newspaper: a bigger map, much less text, more self-explaining interaction, a simple logo |
| 2026-10-30 | Wrote the repository description and published the demo video on the live site |
| 2026-11-24 | Checked the project against the bootcamp guidance and chose the fixes (purpose line, units, chart titles) |
| 2026-11-25 | Asked for the pipeline to work with any SAS year and tested it (`tests/check_any_year.py`); chose new labels for end users (Harvest gap, Gap value, Boost yield) and added the benchmark card |
| _pending_ | Check the Kinyarwanda interface text (`app/i18n.js`) with a fluent speaker, using the checklist in [kinyarwanda-review.md](kinyarwanda-review.md). Record here who checked it and when |

## What the AI assistant did

| Date | Tool | Assistance |
|---|---|---|
| 2026-10-27 | Claude (Anthropic) | Drafted code for the data extraction (`src/extract_*.py`, `src/sas_tables.py`) and the analysis (`src/yield_gaps.py`, `src/input_links.py`, `src/peer_districts.py`) |
| 2026-10-28 | Claude (Anthropic) | Drafted code for the web app (`app/`) and the features the team chose |
| 2026-10-28 | Claude (Anthropic) | Drafted test scripts (`tests/`), which the team reviewed and ran |
| 2026-10-28 | Claude (Anthropic) | Generated the Kinyarwanda translations of the interface (`app/i18n.js`), still to be checked by a fluent speaker |
| 2026-10-29 | Text-to-speech tool | Generated the synthetic voice of the demo video |
| 2026-11-25 | Claude (Anthropic) | Drafted code for the any-year pipeline and the new labels |
