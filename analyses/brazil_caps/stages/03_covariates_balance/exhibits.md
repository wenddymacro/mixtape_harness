# 03_covariates_balance — exhibits

| Exhibit | File | What it shows | Producer |
|---|---|---|---|
| Propensity-score overlap | `output/figures/pscore_main.png` | Distribution of the estimated probability of ever adopting a CAPS, never-treated vs ever-treated, 2002 cross-section, probit on 13 baseline covariates | `scripts/r/31_csdid_main.R` |
| Baseline balance | `output/tables/balance_main.tex` | Control mean, treated mean and Imbens-Rubin normalized difference for all 13 covariates, baseline 2002; \|ND\| > 0.25 flagged | `scripts/r/31_csdid_main.R` |

**Headline from these exhibits:** all 13 covariates exceed \|ND\| > 0.25; the supports
overlap and no control has a propensity score above 0.995, so no trimming was applied.

**Related but filed with Step 4:** EPV by cohort (`output/tables/cohort_rollout.tex` carries
the cohort sizes; the EPV arithmetic is in `findings.md` and is not yet an exhibit of its
own — 7 of 14 cohorts below the floor of 7).
