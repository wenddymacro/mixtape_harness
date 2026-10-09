# 01_target — findings

## The target parameter

ATT(g,t) = E[ Y_t(g) − Y_t(0) | G_g = 1 ], aggregated to event time, for the ever-treated
municipalities of Brazil, 2002–2016.

- **Estimand:** ATT — the effect of *adopting* a CAPS, for municipalities that adopt one.
- **Population:** the 1,344 municipalities with a first CAPS in 2003–2016. The 296 treated
  in 2002 are excluded (no pre-period); the 3,836 never-treated are the comparison group.
- **Population weighting:** no. The outcome is already a rate per 10,000 and the estimator
  operates at the municipality level; the aggregation weights come from `did` (cohort
  shares), not population. Where a weighting choice *was* made — the descriptive national
  rate in Step 2 — it is population-weighted and the figure says so.
- **Unit:** municipality (`cod`). **Time:** year (`ano`).
- **Why this estimand:** the policy question is what a municipality gets from opening a
  CAPS. That is an ATT. An ATE would ask what a never-adopting municipality would have
  gotten, which is not a decision anyone faces.

## What this choice commits us to

An ATT identified off not-yet-treated and never-treated municipalities requires parallel
trends in homicides between adopters and non-adopters. Steps 5 and 8 attack that
assumption; Step 6 asks whether the design could detect anything even if it holds.
