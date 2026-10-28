"""Peer districts: a nearest-neighbour model of which districts farm under similar conditions.

The national benchmark compares every district with the best in Rwanda, including districts with
very different soils and climate. This script finds, for each district, crop and season, the k
districts most similar to it, so it can be compared with fair peers and "learn from" the most
similar district that does better.

Similarity uses two kinds of features, each standardised (z-scores) across the 30 districts:
  - crop mix: the share of the district's harvested area under each of the 16 single crops in that
    season (what a district grows says a lot about its altitude, rainfall and soils);
  - location: the centre of the district's shape (longitude, latitude), times a weight.

Model selection. k and the location weight are chosen by leave-one-out validation: hide each
district, predict its (log) yield for every crop and season as the mean of its k peers, and pick
the settings with the smallest mean absolute error. The same error for a "national" prediction
(mean of all other reliable districts) shows how much the peers add. Because the settings are
picked on the same cases they are scored on, that figure is slightly optimistic, so a nested test
also reports performance with the settings chosen without the district being predicted.

Reads data/processed/sas2025_district_yields.csv and the district boundaries, and writes
data/processed/peer_districts.csv and data/processed/peer_model_validation.csv.

Usage:  python src/peer_districts.py
"""
import csv
import json
from itertools import product

import numpy as np

from sas_tables import DISTRICT_PROVINCE, PROCESSED, ROOT
from yield_gaps import CROPS, MIN_AREA_HA, SEASONS

YIELDS = PROCESSED / "sas2025_district_yields.csv"
BOUNDARIES = ROOT / "data" / "raw" / "boundaries" / "geoBoundaries-RWA-ADM2_simplified.geojson"
OUT = PROCESSED / "peer_districts.csv"
VALIDATION = PROCESSED / "peer_model_validation.csv"

K_OPTIONS = [3, 4, 5, 6, 8]
LOCATION_WEIGHTS = [0.0, 1.0, 2.0, 3.0, 4.0]
DISTRICTS = list(DISTRICT_PROVINCE)


def centroids():
    """Area-weighted centroid of each district polygon (outer ring), in degrees."""
    out = {}
    for f in json.load(open(BOUNDARIES, encoding="utf-8"))["features"]:
        ring = np.array(f["geometry"]["coordinates"][0])
        x, y = ring[:, 0], ring[:, 1]
        cross = x[:-1] * y[1:] - x[1:] * y[:-1]
        area = cross.sum() / 2
        out[f["properties"]["shapeName"]] = (
            ((x[:-1] + x[1:]) * cross).sum() / (6 * area),
            ((y[:-1] + y[1:]) * cross).sum() / (6 * area),
        )
    return out


def load():
    yields, areas = {}, {}
    for r in csv.DictReader(open(YIELDS, encoding="utf-8")):
        if r["level"] != "district" or r["season"] not in SEASONS or r["crop"] not in CROPS:
            continue
        area = float(r["harvested_area_ha"] or 0)
        areas[(r["season"], r["district"], r["crop"])] = area
        if r["yield_kg_ha"] and area >= MIN_AREA_HA:
            yields[(r["season"], r["crop"], r["district"])] = float(r["yield_kg_ha"])
    return yields, areas


def zscore(m):
    sd = m.std(axis=0)
    sd[sd == 0] = 1
    return (m - m.mean(axis=0)) / sd


_DISTANCES = {}


def distances(season, areas, cents, loc_weight):
    """30 x 30 distance matrix between districts for one season (cached: areas never change in a run)."""
    key = (season, loc_weight)
    if key not in _DISTANCES:
        _DISTANCES[key] = _distances(season, areas, cents, loc_weight)
    return _DISTANCES[key]


def _distances(season, areas, cents, loc_weight):
    mix = np.array([[areas.get((season, d, c), 0.0) for c in CROPS] for d in DISTRICTS])
    mix = mix / mix.sum(axis=1, keepdims=True)
    loc = np.array([cents[d] for d in DISTRICTS])
    features = np.hstack([zscore(mix), loc_weight * zscore(loc)])
    diff = features[:, None, :] - features[None, :, :]
    return np.sqrt((diff ** 2).sum(axis=2))


def peers_for(season, crop, district, dist, yields, k):
    """The k nearest districts with a reliable yield for this crop and season."""
    i = DISTRICTS.index(district)
    order = np.argsort(dist[i])
    found = [DISTRICTS[j] for j in order if j != i and (season, crop, DISTRICTS[j]) in yields]
    return found[:k], {DISTRICTS[j]: float(dist[i, j]) for j in order}


def validate(yields, areas, cents, k, loc_weight):
    """Leave-one-out mean absolute error of log yield: peers vs national mean, per crop and season."""
    rows = []
    for season in SEASONS:
        dist = distances(season, areas, cents, loc_weight)
        for crop in CROPS:
            members = [d for d in DISTRICTS if (season, crop, d) in yields]
            if len(members) < k + 2:
                continue
            err_peer, err_nat = [], []
            for d in members:
                actual = np.log(yields[(season, crop, d)])
                peers, _ = peers_for(season, crop, d, dist, yields, k)
                others = [np.log(yields[(season, crop, o)]) for o in members if o != d]
                err_peer.append(abs(actual - np.mean([np.log(yields[(season, crop, p)]) for p in peers])))
                err_nat.append(abs(actual - np.mean(others)))
            rows.append({"season": season, "crop": crop, "n": len(members),
                         "mae_peer": float(np.mean(err_peer)), "mae_national": float(np.mean(err_nat))})
    return rows


def select(yields, areas, cents):
    """Choose (k, location weight) by leave-one-out error. Several pairs tie, so prefer the simplest:
    the smallest k (then smallest weight) within 1% of the best error."""
    scores = []
    for k, w in product(K_OPTIONS, LOCATION_WEIGHTS):
        rows = validate(yields, areas, cents, k, w)
        n = sum(r["n"] for r in rows)
        scores.append((sum(r["mae_peer"] * r["n"] for r in rows) / n, k, w, rows))
    lowest = min(s[0] for s in scores)
    best = min((s for s in scores if s[0] <= lowest * 1.01), key=lambda s: (s[1], s[2]))
    return best, scores


def nested_validation(yields, areas, cents):
    """Honest performance: for every district, choose (k, weight) WITHOUT that district's yields,
    then predict that district. The settings are never picked on the data they are scored on.
    (The crop-mix and location features are unsupervised, so they use all districts.)"""
    err_peer, err_nat, n = 0.0, 0.0, 0
    for d in DISTRICTS:
        without = {key: v for key, v in yields.items() if key[2] != d}
        (_, k, w, _), _ = select(without, areas, cents)
        for season in SEASONS:
            dist = distances(season, areas, cents, w)
            for crop in CROPS:
                if (season, crop, d) not in yields:
                    continue
                members = [m for m in DISTRICTS if (season, crop, m) in without]
                if len(members) < k + 2:
                    continue
                peers, _ = peers_for(season, crop, d, dist, without, k)
                actual = np.log(yields[(season, crop, d)])
                err_peer += abs(actual - np.mean([np.log(without[(season, crop, p)]) for p in peers]))
                err_nat += abs(actual - np.mean([np.log(without[(season, crop, m)]) for m in members]))
                n += 1
    return err_peer / n, err_nat / n, n


def main():
    yields, areas = load()
    cents = centroids()

    (best_mae, k, w, rows), scores = select(yields, areas, cents)
    nat_mae = sum(r["mae_national"] * r["n"] for r in rows) / sum(r["n"] for r in rows)
    print("Leave-one-out mean absolute error of log yield (~ relative error):")
    for mae, kk, ww, _ in sorted(scores)[:5]:
        print(f"  k={kk} location weight={ww}: {mae:.3f}")
    print(f"Chosen k={k}, location weight={w}: peers {best_mae:.3f} vs national mean {nat_mae:.3f} "
          f"-> {100 * (1 - best_mae / nat_mae):.0f}% smaller error")
    nested_peer, nested_nat, nested_n = nested_validation(yields, areas, cents)
    print(f"Nested test (settings picked without the district being scored): peers {nested_peer:.3f} vs "
          f"national mean {nested_nat:.3f} on {nested_n} cases -> {100 * (1 - nested_peer / nested_nat):.1f}% smaller error")

    with open(VALIDATION, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["season", "crop", "n", "k", "location_weight",
                                               "mae_peer", "mae_national", "error_reduction_pct"])
        writer.writeheader()
        for r in rows:
            writer.writerow({**r, "k": k, "location_weight": w,
                             "mae_peer": round(r["mae_peer"], 4), "mae_national": round(r["mae_national"], 4),
                             "error_reduction_pct": round(100 * (1 - r["mae_peer"] / r["mae_national"]), 1)})
        writer.writerow({"season": "all", "crop": "all", "n": sum(r["n"] for r in rows), "k": k,
                         "location_weight": w, "mae_peer": round(best_mae, 4), "mae_national": round(nat_mae, 4),
                         "error_reduction_pct": round(100 * (1 - best_mae / nat_mae), 1)})
        # The honest figure: settings chosen without the district being predicted.
        writer.writerow({"season": "nested", "crop": "all", "n": nested_n, "k": "chosen per district",
                         "location_weight": "chosen per district", "mae_peer": round(nested_peer, 4),
                         "mae_national": round(nested_nat, 4),
                         "error_reduction_pct": round(100 * (1 - nested_peer / nested_nat), 1)})

    out = []
    for season in SEASONS:
        dist = distances(season, areas, cents, w)
        for crop in CROPS:
            for d in DISTRICTS:
                if (season, crop, d) not in yields:
                    continue
                peers, _ = peers_for(season, crop, d, dist, yields, k)
                if not peers:
                    continue
                peer_yields = [yields[(season, crop, p)] for p in peers]
                best = max(peers, key=lambda p: yields[(season, crop, p)])
                out.append({
                    "season": season, "crop": crop, "district": d,
                    "peers": ";".join(peers),
                    "peer_yields_kg_ha": ";".join(f"{v:.1f}" for v in peer_yields),
                    "peer_median_kg_ha": round(float(np.median(peer_yields)), 1),
                    "best_peer": best, "best_peer_kg_ha": round(yields[(season, crop, best)], 1),
                })
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(out[0]))
        writer.writeheader()
        writer.writerows(out)
    print(f"Wrote {len(out)} rows to {OUT.relative_to(ROOT)} and {VALIDATION.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
