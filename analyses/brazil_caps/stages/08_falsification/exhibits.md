# 08_falsification — exhibits

| Exhibit | File | What it shows | Producer |
|---|---|---|---|
| Placebo event study | `output/figures/csdid_event_study_falsif.png` | Effect of CAPS on deaths of despair per 10,000, identical sample/specification to the homicide run | `scripts/r/32_csdid_falsif.R` |
| Placebo coefficients | `output/tables/csdid_falsif_results.csv` | Event time, ATT, SE, uniform CI bounds for the placebo outcome | `scripts/r/32_csdid_falsif.R` |
| Placebo aggregations | `output/tables/csdid_falsif_aggregates.tex` | Simple and dynamic placebo aggregations with the two-sided p-value | `scripts/r/32_csdid_falsif.R` |
| Sensitivity — **ABSENT** | `output/tables/brazil_caps_sensitivity_BLOCKED.txt` | A statement of absence: why Step 8d produced no numbers on did 2.1.1 | `scripts/r/32_csdid_falsif.R` |

**Headline:** placebo simple ATT **−0.0145**, SE 0.0355, **p = 0.684** — no detectable effect
on the outcome CAPS should not move.

**Deliberately missing:** `brazil_caps_sensitivity.tex` (and the sensitivity figure) do not
exist. Their absence is the finding, and it is visible on the dashboard rather than papered
over.
