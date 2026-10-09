# 08_falsification — findings

## 8a. Pre-treatment leads (same outcome, same units)

From the main event study: leads at −5…−2 are all small (+0.04, −0.05, −0.01, +0.02) and
every uniform band covers zero. Visually flat around zero, no drift in either direction.

**Joint test: not reported.** It requires the variance-covariance matrix of the event-study
coefficients, which `did` 2.1.1 does not expose. Individual insignificance is weaker evidence
than joint insignificance, and the difference is stated rather than glossed.

## 8c. Placebo outcome — deaths of despair (this is the falsification that ran)

`sim_diseases_despair` — labelled "deaths of despair per 10,000 people" — on the **identical**
sample (g ≠ 2002, 5,180 municipalities), **identical** 13 covariates, **identical** estimator
settings. Only the outcome changes. A placebo on a different sample is not a placebo, so the
sample is held fixed on purpose.

- **Placebo simple ATT = −0.0145**, SE 0.0355, z = −0.41, **two-sided p = 0.684**.
- Placebo dynamic: −0.0338, SE 0.0506, CI [−0.133, +0.065].
- Every placebo event-time band covers zero, pre and post.

**Verdict: no detectable effect on the placebo outcome.** The design is not simply picking up
a differential trend shared by everything; whatever is moving homicides is not moving deaths
of despair.

### Two honest caveats on this placebo

1. **`sim_overdose` is 96.8% exact zeros** (mean 0.0182). It was carried in the build but is
   near-uninformative; a reassuring zero there would be evidence of nothing. The informative
   placebo is `sim_diseases_despair`.
2. **Deaths of despair are not an unrelated outcome.** The paper's own framing makes mental
   health a channel to deaths of despair too. A null here is evidence the homicide result is
   not a generic trend artifact; it is not evidence that the reform had no mental-health
   effect.

## 8d. Rambachan-Roth sensitivity — **BLOCKED, not skipped**

`aggte()` in did 2.1.1 returns no variance-covariance matrix; `HonestDiD` requires the full
VCV because the bounds are joint. The exposed influence function was tested and does not
reproduce the reported SEs under any constant normalisation (~21% relative spread), so an
approximate `sigma` would have been invented.

**No sensitivity numbers were produced.** The script writes
`output/tables/brazil_caps_sensitivity_BLOCKED.txt` and stops. Full record:
`audits/incidents/2026-10-09_brazil_caps_honestdid-blocked.md`.

This is also why the source lab's shortcut was not reused: that code computes `se + M*se` by
hand and captions the figure as the Rambachan-Roth bounding method. The arithmetic is not the
method. A number that looks like the method and is not would be worse than an absent one.

## Step 8 sign-off status

| requirement | status |
|---|---|
| 8a leads flat | met (individually; joint test blocked) |
| 8b placebo group | **not run** |
| 8c placebo outcome | **met** — p = 0.684 |
| 8d sensitivity bounds | **BLOCKED** by estimator version |
| "at least one of 8b or 8c ran" | met |

Step 8 is therefore **partially complete**, and Step 8d is the outstanding item.
