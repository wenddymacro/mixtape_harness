# Incident — Step 8d (HonestDiD sensitivity) blocked by the estimator version

- **Slug:** brazil_caps
- **Date:** 2026-10-09
- **Failure mode:** sensitivity analysis cannot be computed — required input does not exist
- **Status:** OPEN — awaiting the researcher's decision on the resolution below
- **Checklist step:** 8d (Rambachan-Roth bounds) / gate 7b (package preflight)

## What happened

`scripts/r/32_csdid_falsif.R` reaches Step 8d and stops, deliberately, writing
`output/tables/brazil_caps_sensitivity_BLOCKED.txt` instead of a results table.

## Why — the version gap has a concrete cost

Step 0 recorded `did` **2.1.1** installed against **2.5.1** upstream. That gap was
treated as a documentation matter until this step. It is not:

1. `aggte()` in did 2.1.1 returns `overall.att`, `overall.se`, `type`, `egt`,
   `att.egt`, `se.egt`, `crit.val.egt`, `inf.function`, `min_e`, `max_e`,
   `balance_e`, `call`, `DIDparams` — and **no variance-covariance matrix**.
   (Verified by printing `names()` and the class/dim of every member, not assumed.)
2. `HonestDiD::createSensitivityResults()` requires `sigma`, the **full VCV** of the
   event-study coefficients. The Rambachan-Roth bounds are joint in the coefficients;
   pointwise standard errors are not a substitute.
3. The one candidate source is the exposed influence function
   `inf.function$dynamic.inf.func.e` (5173 × 28). It was **tested, not trusted**.
   Under every constant normalisation tried, its column norms do not reproduce
   `se.egt`: the ratio `se.egt / sqrt(colSums(IF^2))` ranges 0.000175 to 0.000216
   across the 28 event times — a **~21% relative spread**, so no scalar recovers
   the VCV. `crossprod(IF)/n`, `/n²` and `/(n(n-1))` were each off by ~10% on the
   diagonal.

A `sigma` built from that influence function would be an invented number wearing
the costume of an estimate. That is the failure this harness exists to prevent, so
**no sensitivity numbers were produced.**

## Why this matters beyond one table

The course's own `brazil.R` computes its "robust" interval as `se + M*se` by hand
and captions the resulting figure *"Robust confidence intervals using Rambachan and
Roth (2023) bounding method."* The arithmetic is not that method. The same file
carries an honest inline comment ("This is a simplified version") that the caption
does not. This incident is the reason that shortcut was not reused here.

## Resolution options (researcher decides)

1. **Upgrade `did` to ≥ 2.5.1 and re-run `31_` then `32_`.** CLAUDE.md requires
   asking before installing or upgrading; that permission has not been given.
   Unverified: whether a newer `did` exposes the VCV, and whether it installs
   cleanly on the R 4.1.2 here. This should be confirmed, not assumed.
2. **Bootstrap the event-study VCV** — resample municipalities with replacement,
   re-run `att_gt` + `aggte` per draw, hand the resulting `sigma` to HonestDiD.
   Legitimate and version-independent, at the cost of compute (~0.2–0.6 min per
   draw) and one more thing to verify: the bootstrap SEs must be checked against
   did's `se.egt` before the VCV is trusted.

## What is NOT blocked

Step 8c (placebo outcome, deaths of despair) ran and passed:
simple ATT = −0.0145, SE 0.0355, two-sided p = 0.684. Step 8a (pre-treatment
leads) is visible in the main event study. So the checklist's requirement that "at
least one of 8b or 8c ran" is met; 8d is the outstanding item.
