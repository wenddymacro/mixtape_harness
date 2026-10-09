# 07_estimator_eventstudy — exhibits

| Exhibit | File | What it shows | Producer |
|---|---|---|---|
| Event study, homicides | `output/figures/csdid_event_study_main.png` | ATT by years relative to adoption, Callaway-Sant'Anna, not-yet-treated comparison, 95% uniform bands; reference period at −1 marked hollow | `scripts/r/31_csdid_main.R` |
| Event-study coefficients | `output/tables/csdid_main_results.csv` | Event time, ATT, SE, uniform CI bounds, reference flag, critical value | `scripts/r/31_csdid_main.R` |
| Aggregations | `output/tables/csdid_main_aggregates.tex` | Simple, dynamic, group and calendar aggregations with standard errors | `scripts/r/31_csdid_main.R` |
| Fitted estimator object | `data/derived/csdid_main.rds` | The `att_gt` object (210 cells, 0 NA) | `scripts/r/31_csdid_main.R` |
| Dynamic export | `data/derived/csdid_main_dynamic.rds` | Event-study coefficients and SEs, exported in-session because `aggte` cannot run on a reloaded object in did 2.1.1 | `scripts/r/31_csdid_main.R` |

**Headline:** simple ATT **+0.2098** (SE 0.0654); dynamic average **+0.2746** (SE 0.1346).
Positive — more homicides, opposite in sign to the published result. Flagged in `findings.md`.
