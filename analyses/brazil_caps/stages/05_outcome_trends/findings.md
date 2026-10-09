# 05_outcome_trends — findings

## What was looked at, and what was deliberately not

`output/figures/outcome_by_cohort.png` plots mean homicides per 10,000 by adoption cohort,
**truncated at the year before each cohort adopts**. The never-treated line runs the full
window, because those units are never treated and every year of theirs is a pre-period.

Post-adoption years are excluded on purpose. Step 5 exists to ask whether treated and
comparison units looked comparable *before* treatment; looking at the after-period here
would turn a comparability check into an early peek at the answer and void the check.

## What the pre-periods look like

- **Levels differ across cohorts.** The never-treated sit near 1.0–1.9 per 10,000 across
  2002–2016; the 2005–2009 cohorts start near 1.5–1.9. Consistent with the Step 3 balance
  finding: adopters are not a random draw.
- **Slopes are broadly parallel, and none is flat.** The never-treated line rises steadily
  from 1.03 (2002) to 1.90 (2016). Most cohort pre-periods rise too, at a similar pitch.
  That is the configuration the design needs: parallel *trends*, not equal levels.
- **The 2003 cohort has a single pre-period year** (2002 only), so its panel is one point.
  Its pre-trend is not assessable at all — and that is the same cohort that failed the EPV
  screen in Step 3 (3.62). Two different diagnostics pointing at the same cohort is worth
  noticing.

## The honest limit on this step

A visual pre-trend check on 14 cohorts at this resolution cannot rule out a small
differential trend. It can only fail to reveal a large one. The formal version of this
check is the event-study leads in Step 7 and the sensitivity analysis in Step 8 — which is
where the run currently stops, because Step 8d is blocked by the estimator version.
