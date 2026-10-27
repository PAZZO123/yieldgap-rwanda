"""How district input use relates to crop yield, Seasons A and B 2025.

For each crop and practice, uses every district x season with a reliable yield estimate
(harvested area >= MIN_AREA_HA, from yield_gaps.py) and the district's overall adoption of the
practice. Yields are logged, and both yield and adoption are centred on their season mean, so
Season A/B differences don't count as an effect. The fitted slope is reported as the % difference
in yield per +10 percentage points of adoption, with a 95% confidence interval.

Robustness:
  - Spearman rank correlation on the same season-centred values (not thrown off by outliers).
  - The same slope within provinces (centred on season x province), so a link that only reflects
    differences between regions (altitude, soils, rainfall) shows up as unstable.
  - Benjamini-Hochberg q-values across all crop x practice tests, to control false positives.

These are associations between districts, not causal effects: districts that use more fertilizer
may also differ in soils, markets and extension support.

Reads data/processed/sas2025_district_yields.csv and sas2025_district_inputs.csv and writes
data/processed/input_yield_links.csv.

Usage:  python src/input_links.py
"""
import csv
from collections import defaultdict

import numpy as np
from scipy import stats

from sas_tables import PROCESSED, ROOT
from yield_gaps import CROPS, MIN_AREA_HA, SEASONS, load_yields

INPUTS = PROCESSED / "sas2025_district_inputs.csv"
OUT = PROCESSED / "input_yield_links.csv"

MIN_OBS = 20  # district x season observations needed to test a crop
# A practice that barely varies between districts (e.g. mechanization, ~1% of farmers) cannot
# support a "per +10 points" estimate: that would extrapolate far outside the data.
MIN_ADOPTION_SD = 5.0

# Practice and the adoption measure used for it. Seed and fertilizer use the share of crop
# area treated; the others are only published as the share of farmers.
PRACTICES = [
    ("improved_seed", "area_pct"),
    ("inorganic_fertilizer", "area_pct"),
    ("organic_fertilizer", "area_pct"),
    ("erosion_control", "farmers_pct"),
    ("irrigation", "farmers_pct"),
    ("mechanization", "farmers_pct"),
    ("agroforestry", "farmers_pct"),
]


def load_inputs():
    values = {}
    for r in csv.DictReader(open(INPUTS, encoding="utf-8")):
        if r["level"] == "district" and r["farmer_type"] == "Overall":
            values[(r["season"], r["district"], r["practice"], r["measure"])] = float(r["value"])
    return values


def centre(values, groups):
    """Subtract each group's mean from its members."""
    values, out = np.asarray(values, float), np.empty(len(values))
    for g in set(groups):
        idx = [i for i, x in enumerate(groups) if x == g]
        out[idx] = values[idx] - values[idx].mean()
    return out


def slope(x, y, n_groups):
    """OLS slope through centred data, its standard error and p-value (df = n - groups - 1)."""
    sxx = float(x @ x)
    if sxx == 0:
        return None
    b = float(x @ y) / sxx
    df = len(x) - n_groups - 1
    if df < 5:
        return None
    se = np.sqrt(float(((y - b * x) ** 2).sum()) / df / sxx)
    p = 2 * stats.t.sf(abs(b / se), df)
    return b, se, p, df


def pct_per_10pp(b):
    return 100 * (np.exp(10 * b) - 1)


def main():
    yields = [r for r in load_yields() if r["reliable"] and r["crop"] in CROPS]
    inputs = load_inputs()

    out = []
    for crop in CROPS:
        rows = [r for r in yields if r["crop"] == crop]
        for practice, measure in PRACTICES:
            obs = [(r, inputs[(r["season"], r["district"], practice, measure)]) for r in rows
                   if (r["season"], r["district"], practice, measure) in inputs]
            if len(obs) < MIN_OBS or np.std([a for _, a in obs], ddof=1) < MIN_ADOPTION_SD:
                continue
            seasons = [r["season"] for r, _ in obs]
            cells = [(r["season"], r["province"]) for r, _ in obs]
            log_y = [np.log(r["yield_kg_ha"]) for r, _ in obs]
            adoption = [a for _, a in obs]

            x, y = centre(adoption, seasons), centre(log_y, seasons)
            fit = slope(x, y, len(set(seasons)))
            if fit is None:
                continue
            b, se, p, df = fit
            t_crit = stats.t.ppf(0.975, df)
            rho, rho_p = stats.spearmanr(x, y)
            within = slope(centre(adoption, cells), centre(log_y, cells), len(set(cells)))

            out.append({
                "crop": crop, "practice": practice, "measure": measure, "n_obs": len(obs),
                "adoption_mean": round(float(np.mean(adoption)), 1),
                "adoption_sd": round(float(np.std(adoption, ddof=1)), 1),
                "yield_pct_per_10pp": round(pct_per_10pp(b), 1),
                "ci95_low": round(pct_per_10pp(b - t_crit * se), 1),
                "ci95_high": round(pct_per_10pp(b + t_crit * se), 1),
                "p_value": p,
                "spearman_rho": round(float(rho), 2), "spearman_p": float(rho_p),
                "within_province_pct_per_10pp": round(pct_per_10pp(within[0]), 1) if within else "",
                "within_province_p": within[2] if within else "",
            })

    q = stats.false_discovery_control([r["p_value"] for r in out], method="bh")
    for r, qv in zip(out, q):
        r["q_value"] = float(qv)
        same_sign = r["within_province_pct_per_10pp"] != "" and \
            np.sign(r["within_province_pct_per_10pp"]) == np.sign(r["yield_pct_per_10pp"])
        if qv < 0.05 and same_sign:
            r["evidence"] = "strong"
        elif r["p_value"] < 0.05:
            r["evidence"] = "suggestive"
        else:
            r["evidence"] = "none"
        # The app's what-if scenarios only use links that are strong, positive and hold up within
        # provinces (at least half the size). Negative links, such as irrigation with potato, mostly
        # reflect where crops are grown (irrigation is common in the dry east, potato thrives in the
        # cool, wet north), so they are reported but never turned into advice.
        r["use_in_scenarios"] = bool(
            r["evidence"] == "strong" and r["yield_pct_per_10pp"] > 0
            and r["within_province_pct_per_10pp"] >= 0.5 * r["yield_pct_per_10pp"]
        )
        for k in ("p_value", "spearman_p", "within_province_p", "q_value"):
            if r[k] != "":
                r[k] = round(r[k], 4)

    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(out[0]))
        writer.writeheader()
        writer.writerows(out)
    print(f"Wrote {len(out)} crop x practice tests to {OUT.relative_to(ROOT)}")

    counts = defaultdict(int)
    for r in out:
        counts[r["evidence"]] += 1
    print("Evidence:", dict(counts))
    print(f"\n{'crop':15} {'practice':21} {'n':>3} {'%/10pp':>7} {'95% CI':>15} {'q':>6} {'rho':>5} {'within':>7}  evidence")
    for r in sorted(out, key=lambda r: r["q_value"]):
        if r["evidence"] == "none":
            continue
        print(f"{r['crop']:15} {r['practice']:21} {r['n_obs']:3} {r['yield_pct_per_10pp']:7} "
              f"{'[' + str(r['ci95_low']) + ', ' + str(r['ci95_high']) + ']':>15} {r['q_value']:6} "
              f"{r['spearman_rho']:5} {r['within_province_pct_per_10pp']:7}  {r['evidence']}")


if __name__ == "__main__":
    main()
