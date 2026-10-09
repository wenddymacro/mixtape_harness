# 04_sample_shares — exhibits

| Exhibit | File | What it shows | Producer |
|---|---|---|---|
| Cohort rollout and shares | `output/tables/cohort_rollout.tex` | Municipalities per CAPS cohort, each cohort's share of the analysis-treated sample, the never-treated and excluded-always-treated totals, and the dominant cohort | `scripts/r/31_csdid_main.R` |
| Treatment rollout figure | `output/figures/rollout_panelview.png` | Which municipalities are treated, by year, ordered by adoption timing | `scripts/r/31_csdid_main.R` (panelView) |
| Cohort counts | `data/derived/gvar_county.csv` | One row per municipality: cohort `g`, ever-treated flag, always-treated flag, analysis-sample flag | `scripts/r/30_build_gvar.R` |

Sample: 5,180 municipalities in the analysis sample (1,344 treated + 3,836 never-treated);
296 always-treated excluded.
