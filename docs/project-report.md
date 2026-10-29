# Rwanda Yield-Gap Explorer: project documentation

**NISR Big Data Hackathon 2026 · Track 1: Agricultural Productivity**

**Team The Pillars:** Uwineza Gloria and Patrick Straton MBABAZI

- **App:** <https://pazzo123.github.io/yieldgap-rwanda/>
- **Code and data pipeline:** <https://github.com/PAZZO123/yieldgap-rwanda>
- **Methods in detail:** [methodology.md](methodology.md)

## Summary

Rwanda wants food crops to be 50% more productive by 2029, but the same crop yields very
differently from one district to the next. The Yield-Gap Explorer uses the NISR Seasonal
Agricultural Survey (SAS) 2025 to show, for 16 crops, 30 districts and both main seasons:

1. how far each district's yield is below a **benchmark**, the level the top quarter of Rwandan
   districts already reached in 2025;
2. how much **extra food** closing that gap would produce on the land already farmed, and what it
   is **worth in Frw**, so crops can be compared and each district's priorities ranked;
3. which **farm practices** go with higher yields for that crop, and what raising them to the level
   of the best-performing district could add.

It is a free, phone-friendly web app in **English and Kinyarwanda** that anyone can open. Each
district gets an automatically written summary, a printable sheet and downloadable data. Everything
is built on NISR data with a fully reproducible pipeline.

## 1. Problem and relevance to national priorities

The NST2 goal for agriculture, carried into the Fifth Strategic Plan for Agriculture
Transformation, is *"a 50% increase in productivity and more than 6% annual growth in
agricultural GDP"* (MINAGRI, PSTA 5 abridged version, p. 14). PSTA 5 notes that during PSTA 4,
food-crop production grew mainly because more land was farmed, while yields improved for some
crops and fell for others (p. 8). With little new land left, the extra food has to come from
higher yields on existing land.

SAS 2025 shows plenty of room for this inside Rwanda itself:

| Crop, season | Benchmark (top quarter) | Districts below it | Extra harvest if all reached it |
|---|---|---|---|
| Maize, A | 1,930 kg/ha | 22 of 30 | 31,550 t |
| Climbing bean, B | 925 kg/ha | 20 of 27 | 11,032 t |
| Irish potato, B | 7,267 kg/ha | 15 of 21 (median gap 37%) | 44,949 t |
| Sweet potato, A | 8,833 kg/ha | 22 of 30 | 63,075 t |
| Cassava, B | 16,258 kg/ha | 19 of 26 | 118,331 t |

Valued with NISR's own crop value added (SAS Table 8, 2017 prices), closing every gap for every
crop in both seasons would add about **118.7 billion Frw a year**. The largest shares are
cassava (17.7 bn), Irish potato (16.8 bn), sweet potato and cooking banana (13.8 bn each), and
maize (10.5 bn).

PSTA 5 also sets input targets for 2028/29. Small-scale farmers using improved seed should rise
from 35.9% to 50%, and those using mineral fertilizer from 54.9% to 66.5% (PSTA 5 results
framework, p. 22). SAS 2025 puts small-scale improved-seed use at 35.9% in Season A and only 16.7%
in Season B. The question planners face is therefore *where* extra inputs and extension support
would close the largest gaps. The Explorer answers it district by district.

## 2. Who it is for and how they use it

- **District agronomists and agriculture officers:** see which crops matter most in their district
  (ranked by value), where the district stands for each crop, how it compares with Rwanda on each
  practice, and what closing the gap is worth in tonnes and francs. They can print a one-page
  district sheet for meetings, in English or Kinyarwanda.
- **MINAGRI, RAB and development partners:** rank districts by the extra food at stake, to target
  input distribution, extension campaigns and Food Basket Site investments.
- **Cooperatives, researchers and students:** explore the data and share a view as a link
  (e.g. `#B/Cassava/Rusizi`).

**Example:** Bugesera, maize, Season A 2025. Bugesera harvested 1,611 kg/ha on 9,630 ha, 16.5%
below the 1,930 kg/ha benchmark. That is the largest maize opportunity in the country, at 3,075 t.
Bugesera's farmers apply improved seed to 35.5% of the crop area. If that rose to the highest level
any district reached in 2025 (52.7%), the district-level link suggests about 1,781 kg/ha, closing
roughly half of the gap. The crop priorities view
adds a twist: Bugesera's single biggest opportunity is not maize but Season A bush bean. Its gap
would add a similar 3,112 t, but worth about 1.5 bn Frw against 784 M Frw for maize, and the
district summary says so in plain words.

## 3. Data and methodology

**Data.** All agricultural data come from **NISR, Seasonal Agricultural Survey 2025, annual
tables** (public Excel file):

- yield by crop and district (Tables 19–21);
- harvested area (Tables 16–17);
- improved seed use (Tables 33–34);
- organic and mineral fertilizer use (Tables 43–44, 46–47);
- erosion control, irrigation, machines and agroforestry (Tables 64–65);
- area under each practice (Tables 11–12);
- crop value added per hectare, 2017 prices (Table 8).

District boundaries are from geoBoundaries (source: Open Data Rwanda / NISR, CC BY 4.0). Raw files
are never committed. Scripts download nothing by themselves, and the steps are documented in
[data/README.md](../data/README.md).

**Pipeline.** Seven Python scripts turn the raw workbook into the app's data. Each extraction was
checked against values read directly from the Excel sheets, and a full rebuild from the raw file
reproduces every processed table exactly.

**Method, in short** (full detail in [methodology.md](methodology.md)):

- **Reliable estimates only.** A district counts for a crop only if at least 200 ha were
  harvested there. Smaller areas give unstable yields.
- **Benchmark.** The 75th percentile of reliable district yields for each crop and season: a level
  real Rwandan districts reached under 2025 conditions.
- **Gap.** The benchmark minus the district's yield, also turned into tonnes of extra harvest.
  Tonnes are never summed across crops, because fresh roots and dry grain don't compare by weight.
- **Value.** Extra kilograms × value added per kg, derived from Table 8's value added per hectare
  ÷ the 2025 national yield. This can be summed and compared across crops.
- **Practice links.** For each of 88 crop × practice pairs: a log-yield regression on adoption,
  with season effects removed. Each link is checked three ways:
  - a rank correlation;
  - the same estimate *within provinces*, to separate a real link from a regional pattern;
  - Benjamini–Hochberg correction for testing many pairs at once.
- **What-if.** Only links that are strong, positive and hold within provinces drive the what-if
  panel: 6 of the 88.
- **Peer-district model (machine learning).** A national benchmark can be unfair to districts with
  poorer growing conditions. A nearest-neighbour model therefore finds, for every district, crop
  and season, the 4 districts that farm under the most similar conditions (crop mix and
  location). Its settings were chosen by **leave-one-out validation**: knowing a district's peers
  predicts its yield with a 7.5% smaller error than the national average overall (a nested test, with
  the settings chosen without the district being predicted), and 39–46%
  smaller for Irish potato, where altitude and climate matter most. Where peers don't help (e.g.
  paddy rice), the app says so.
- **PSTA 5 tracker.** Each district's share of small-scale farmers using improved seed and mineral
  fertilizer, against the 2028/29 targets of 50% and 66.5%.

**What the analysis found:**

| Crop | Practice | Yield per +10 points of adoption | Within provinces |
|---|---|---|---|
| Maize | Improved seed | +6.2% | +6.0% |
| Bush bean | Mineral fertilizer | +7.1% | +5.8% |
| Climbing bean | Mineral fertilizer | +9.3% | +4.9% |
| Sweet potato | Organic fertilizer | +9.0% | +5.7% |
| Yams & taro | Organic fertilizer | +25.6% | +16.1% |
| Beer banana | Improved seed | +2.8% | +2.2% (marginal) |

Standard errors are clustered by district, because Season A and Season B of the same district are
not independent. An earlier version that ignored this overstated the evidence for maize mineral
fertilizer; it is now only suggestive (+7.6%, q = 0.085) and is not used in the what-if panel.

Some strong links were deliberately *not* turned into advice. Irrigation shows a negative link with
Irish potato and climbing bean yields. This reflects where these crops grow: they do best in the
cool, wet north and west, while irrigation is most common in the dry east. Irrigation itself is
not shown to be harmful.

## 4. The tool and its technical design

- **Map first, little text:** the district map fills most of the screen. Crops are one-tap chips
  with icons, the season is a two-way switch, and the map colours (gap to the benchmark, gap to
  similar districts, yield, extra harvest, value) are pills under the map. Floating numbers show
  the extra harvest possible (tonnes and Frw) and the largest gap.
- **Easy to start:** a "Tap a district" hint that disappears after the first tap, icons with
  tooltips on every control, and a 6-step spotlight guide on the "?" button.
- **Find my district:** one tap uses the phone's location to open the statistics for the district
  you are in. The position is matched to a district on the device and is never sent anywhere.
- **Two languages:** English and Kinyarwanda, switchable at any time and shareable as a link.
- **One highlight at a time:** four findings computed live from the data, each with a "Show me"
  button that opens the view behind it. For example: closing every Season B cassava gap would add
  about 13.4 bn Frw, and Rutsiro trails its best similar district for Season B Irish potato by 44%.
- **Interactive map:**
  - the 30 districts shaded by gap to the benchmark, gap to similar districts, yield, extra
    harvest or value, with colours that fade smoothly when the crop or season changes;
  - smooth zoom (buttons, scroll, pinch, double-click), drag to move, zoom to a district;
  - district search, name labels for the chosen district and its similar districts;
  - hover, tap or keyboard details, a full table of all districts and CSV download.
- **District panel, in six tabs:**
  - *Summary*: gap, extra harvest, value added and yield rank; yield against the benchmark; an
    automatically written plain-language text (the gap, its value, the rank, the clearest practice
    lever, the biggest opportunity across all crops);
  - *Crops*: every crop and season for the chosen district, or for all of Rwanda, ranked by the
    value closing the gap would add. One tap opens that crop;
  - *What if*: sliders for practices with a strong, positive link;
  - *Similar*: the **similar districts** (outlined on the map) with their yields, and each practice
    compared with the national level. For Bugesera maize, the best peer, Ngoma, yields 19.9% more
    and uses improved seed on 46.4% of its maize area against 35.5% in Bugesera;
  - *Goals*: the **PSTA 5 target tracker** (e.g. Bugesera, Season A: 23.6 points short of the 66.5%
    mineral fertilizer target);
  - *Top 10*: districts ranked by extra harvest or by gap %;
  - a **printable one-page district sheet** and a **share link** to the exact view.
- **Light, dark or automatic theme**, remembered between visits.

**Design choices:**

- **Honest by construction.** The what-if uses the more cautious of two estimates. A slider stops
  at the highest level any district actually reached, and results never exceed the best
  district's yield. Crops without a reliable link get an explanation instead of invented numbers.
- **Light and simple to host.** It is a static site with no server, no build step and no
  third-party libraries, with about 315 KB of data, so it loads quickly on a phone connection.
- **Speaks the user's language.** All interface text lives in one file (`app/i18n.js`), so
  translations can be corrected or another language added without touching the code.
- **Accessible.**
  - The map's color scale is one hue in evenly spaced steps, visible against the background in
    light and dark mode, and every class is also named in the legend.
  - Every value is also in a table.
  - The map and ranking work with the keyboard.
  - The layout fits a 375 px phone screen without sideways scrolling.
- **Reproducible and maintainable.**
  - One command per step rebuilds everything from the NISR file.
  - Every push to `main` deploys the app automatically.

## 5. Impact and real-world use

- **Targeting.** It ranks the districts where the same investment would add the most food. For
  Season B cassava, for example, 46% of the national extra-harvest potential is in Rusizi alone.
- **Planning conversations.** It turns "raise productivity 50%" into district-level numbers: how
  many tonnes, which crop, and which practice. Officials can discuss these numbers with farmers
  and cooperatives.
- **Repeatable every season.** NISR publishes the SAS tables in the same format each season.
  Dropping a new file into `data/raw/` and rerunning the scripts updates the whole app.

**Possible next steps:**

- Use the SAS farm-level microdata to estimate crop-specific, plot-level effects.
- Compare districts only with others in the same agro-ecological zone.
- Add earlier SAS rounds, to see which gaps persist across years.
- Test the district sheets with district agronomists, and refine the Kinyarwanda wording with them.

## 6. Limitations

- **Associations, not causes.** The links are between districts, not proven effects. Soils,
  rainfall, markets and extension differ too. The within-province check reduces this problem but
  does not remove it.
- **District averages.** Adoption covers all crops in a district and hides differences between
  farms.
- **One year.** 2025 weather shapes both the gaps and the benchmarks.
- **The benchmark is national.** Some districts may not reach it with inputs alone. The
  peer-district comparison is a fairer local reference, but crop mix and location are only a proxy
  for soils and climate.
- **Values are approximate.** They use one national value-added figure per crop at 2017 prices:
  good for ranking opportunities, not a cash forecast.

## 7. Team, AI use and intellectual property

- **Team The Pillars:** Uwineza Gloria ([@uwinezagloria](https://github.com/uwinezagloria)) and
  Patrick Straton MBABAZI ([@PAZZO123](https://github.com/PAZZO123)).
- **AI use:** the team chose the track, the idea, the data and every feature. Claude (Anthropic)
  was used as a coding and writing assistant that drafted code, analysis and text on request, as
  allowed by the hackathon rules. Details are in [AI_USE.md](AI_USE.md). The team is responsible
  for the work.
- **Intellectual property:** by entering the hackathon, the team assigns all intellectual property
  rights in this work to NISR.

## Sources

- NISR, *Seasonal Agricultural Survey 2025, Annual Tables* (Excel), statistics.gov.rw.
- MINAGRI, *Fifth Strategic Plan for Agriculture Transformation (PSTA 5) 2024/25–2028/29,
  abridged version*, minagri.gov.rw.
- geoBoundaries, Rwanda ADM2 (gbOpen), source Open Data Rwanda / NISR, CC BY 4.0.
