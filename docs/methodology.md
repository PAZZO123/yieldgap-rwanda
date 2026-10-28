# Methodology

All numbers come from the NISR Seasonal Agricultural Survey (SAS) 2025 annual tables
(see [data/README.md](../data/README.md)). The analysis covers Seasons A and B 2025, the two main
seasons, at district level (30 districts).

Reproduce everything from the raw workbook with:

```
python src/extract_yields.py
python src/extract_inputs.py
python src/crop_values.py
python src/yield_gaps.py
python src/input_links.py
python src/build_app_data.py
```

## 1. Which estimates are used

- **Crops.** 16 single crops: maize, sorghum, paddy rice, wheat, cassava, sweet potato,
  Irish potato, yams & taro, cooking banana, dessert banana, banana for beer, bush bean,
  climbing bean, pea, groundnut and soybean. "Bean (all)" and "Banana (all)" are shown too but
  never added into totals, because they are sums of the single crops. Mixed categories (other
  crops, fodder, fruits, vegetables, other cereals) are left out: they lump different plants
  together, so their yields cannot be compared between districts.
- **Reliable estimates.** A district's yield counts only if the crop's harvested area there is at
  least **200 ha**. Smaller areas give unstable estimates. For example, fodder in Kicukiro shows
  26,900 kg/ha from 34 ha.

## 2. Yield gaps (`src/yield_gaps.py` → `data/processed/yield_gaps.csv`)

For each crop and season:

1. **Benchmark** = the 75th percentile (top quarter) of reliable district yields. It is set only
   when at least 8 districts are reliable. The benchmark is something other Rwandan districts
   already achieve under 2025 conditions, not a research-station maximum.
2. **Gap** = benchmark − district yield (0 if the district is already above it), also shown as a
   % of the benchmark.
3. **Potential extra production** = gap × the district's harvested area, in tonnes. It is only
   computed for reliable estimates and never summed across crops, because fresh roots and tubers
   cannot be compared with dry grain by weight.
4. **Value of the extra production** (`src/crop_values.py`). SAS 2025 Table 8 gives each main
   crop's gross value added per hectare in 2025, at constant 2017 prices. Dividing it by the crop's
   2025 national yield (Seasons A and B, weighted by harvested area) gives value added per kg:
   - maize 255 Frw/kg;
   - beans 472 Frw/kg, the same for every bean type, since Table 8 has a single beans row;
   - cassava 113 Frw/kg;
   - Irish potato 191 Frw/kg.

   Extra kg × value per kg = **extra value added (Frw)**. Unlike tonnes, this can be added up and
   compared across crops. Yams & taro have no Table 8 row, so they get no value. Value added
   (output minus inputs, at 2017 prices) is a cautious, comparable measure, not today's
   farm-gate revenue.

## 3. How input use relates to yield (`src/input_links.py` → `data/processed/input_yield_links.csv`)

For each crop × practice, every reliable district × season observation (up to 60) is paired with
the district's overall adoption of the practice in that season:

| Practice | Adoption measure (SAS table) |
|---|---|
| Improved seed | % of crop area sown with improved seed (Tables 33–34) |
| Inorganic fertilizer | % of crop area fertilized (Tables 46–47) |
| Organic fertilizer | % of crop area fertilized (Tables 43–44) |
| Erosion control | % of farmers protecting land against erosion (Tables 64–65) |
| Irrigation | % of farmers irrigating (Tables 64–65) |
| Agroforestry | % of farmers practising agroforestry (Tables 64–65) |

Mechanization (also in Tables 64–65) is not tested: only about 1% of farmers use machines and the
share barely varies between districts. The rule is to skip a practice whose adoption varies by
less than 5 percentage points (standard deviation) across observations.

**Model.** Log yield and adoption are both centred on their season mean, so the difference between
Season A and Season B does not count as an effect. The slope from an ordinary least squares fit
is reported as the **% difference in yield per +10 percentage points of adoption**, with a 95%
confidence interval.

**Checks.**

- *Spearman rank correlation* on the same centred values, which outliers cannot drive.
- *Within-province slope.* The same fit after centring on season × province. If a link mostly
  reflects regional differences (altitude, soils, rainfall), it shrinks or flips here.
- *Benjamini–Hochberg q-values* across all 88 crop × practice tests, so that some links looking
  real by chance is accounted for.

**Evidence labels.**

- `strong`: q < 0.05 and the within-province slope has the same sign.
- `suggestive`: p < 0.05 before the multiple-testing correction.
- `none`: everything else.

`use_in_scenarios` is true only for strong, **positive** links whose within-province slope is at
least half the pooled slope. Only these feed the app's "what if" panel.

## 4. First results (SAS 2025)

**Largest potential gains** (extra tonnes if every district reached the benchmark):

| Season | Crop | Extra tonnes | Biggest single district |
|---|---|---|---|
| A | Sweet potato | 63,075 | Nyamasheke, 9,419 t (gap 38%) |
| A | Cooking banana | 49,612 | Gisagara, 7,882 t (gap 52%) |
| A | Irish potato | 43,209 | Kayonza, 9,438 t (gap 54%) |
| A | Maize | 31,550 | Bugesera, 3,075 t (gap 16%) |
| B | Cassava | 118,331 | Rusizi, 54,789 t (gap 31%; Rusizi harvests 11,000 of Rwanda's 59,000 ha) |
| B | Irish potato | 44,949 | Rutsiro, 8,524 t (gap 34%) |

**In value added** (Frw, 2017 prices): closing every gap, for all crops, in both seasons, would add
about **118.7 billion Frw** a year. By crop, over both seasons:

| Crop | Value added |
|---|---|
| Cassava | 17.7 bn |
| Irish potato | 16.8 bn |
| Sweet potato | 13.8 bn |
| Cooking banana | 13.8 bn |
| Maize | 10.5 bn |
| Climbing bean | 10.4 bn |

Valuing crops changes priorities. In Bugesera, for example, closing the Season A gaps would add a
similar tonnage of bush bean (3,112 t) and maize (3,075 t). The beans are worth about twice as much
(≈ 1.5 bn vs 784 M Frw), because a kilogram of beans carries almost double the value added of a
kilogram of maize.

**Practices linked to higher yields** (used in scenarios):

| Crop | Practice | Yield per +10 pts | 95% CI | Within provinces |
|---|---|---|---|---|
| Maize | Inorganic fertilizer | +7.6% | +2.5 to +12.9% | +7.0% |
| Maize | Improved seed | +6.2% | +1.9 to +10.7% | +6.0% |
| Bush bean | Inorganic fertilizer | +7.1% | +3.5 to +10.8% | +5.8% |
| Climbing bean | Inorganic fertilizer | +9.3% | +3.6 to +15.3% | +4.9% |
| Sweet potato | Organic fertilizer | +9.0% | +4.4 to +13.9% | +5.7% |
| Yams & taro | Organic fertilizer | +25.6% | +10.6 to +42.7% | +16.1% (only 33 obs.) |

**Links that are reported but not used.** Irrigation shows strong *negative* links with Irish
potato (−26% per +10 pts) and climbing bean (−14%). This is a where-crops-grow effect, not harm
from irrigating: irrigation is most common in the dry, low-lying east, while potatoes and climbing
beans do best in the cool, wet north and west, where farmers rarely irrigate. Erosion control with
Irish potato (+28%) falls to +4% within provinces, so it is mainly a regional pattern too.

## 5. Limitations

- **Associations, not causes.** Districts that use more fertilizer may also have better soils,
  markets or extension services. The within-province check reduces this problem but does not
  remove it.
- **District averages.** Adoption is measured across all crops in a district, not per crop, and
  district averages hide differences between farms. Farm-level SAS microdata (catalog id 124)
  would allow crop-specific, plot-level estimates.
- **One year.** 2025 weather shapes both yields and benchmarks. Earlier SAS rounds could show
  whether gaps persist.
- **Value is approximate.** Value added per kg uses one national figure per crop at 2017 prices.
  It ranks opportunities well, but it is not a cash forecast.
- **No agro-ecological zones.** The benchmark compares every district with the national top
  quarter. Districts with poorer growing conditions may not be able to reach it with inputs alone.
