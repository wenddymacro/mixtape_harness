# 03_covariates_balance — findings

## Where the covariate list comes from

Not a search. It is the set the course's own `brazil.R` converged on after probing
`att_gt` control-by-control: 13 baseline covariates that the doubly-robust estimator
tolerates on this panel. The 14th, `poptotaltrend`, makes `att_gt` return an all-NA ATT
surface, so it is excluded — and that exclusion is recorded here rather than discovered
again by trial at estimation time.

`rural = popruraltrend / ano`, exactly as the course defines it.

**The `/covariates` interview was NOT run.** The list was inherited, not elicited. That is
a deviation from Step 3 as the template writes it, and it is recorded as a deviation. The
inherited list is defensible (it is what the replication uses), but "the replication does
it" is a different justification from "these are the X that drive E[Y(0)] trends", and the
difference should be visible.

## Balance: every single covariate fails the threshold

Baseline year 2002, never-treated vs ever-treated (296 always-treated excluded):

| | |
|---|---|
| covariates tested | 13 |
| exceeding Imbens-Rubin \|0.25\| | **13 of 13** |
| worst | `pop60a69anoslino` ND = **−0.757** |
| best | `pop70a79anosnino` ND = −0.251 |

Signs are systematic, not random: treated municipalities are **less rural** (−0.603),
**poorer in the health-spending proxy** (−0.450), **more unequal** (+0.368), and older
cohorts are **smaller** across the board (−0.38 to −0.76). Read together: CAPS arrived
first in larger, denser, less rural, wealthier-service municipalities.

**This is not automatically fatal, and it is not automatically fine.** Balance is not the
identifying assumption — parallel trends is. But 13/13 imbalance in covariates that plausibly
drive homicide trends is exactly the configuration where a differential trend hides, which
is why Step 8's falsification carries the weight it does here.

## Overlap

Probit of ever-treated on the same 13 covariates, 2002 cross-section. 3 of 5,180
municipalities drop for NA in a covariate (cod 125, 851, 3627) — named, not silently
dropped.

- Control propensity scores: min 0.0000, max 0.9851
- Treated: min 0.0028, max 0.9964
- Controls with pscore > 0.995: **0**
- Perfect separation: **no** — the supports overlap.

No trimming applied, and therefore none to justify.

## EPV — the finding that most needs saying out loud

EPV_g = n_g / k, with k = 13 covariates, computed **within cohort**:

| cohort | treated | EPV | | cohort | treated | EPV |
|---|---|---|---|---|---|---|
| 2003 | 47 | **3.62** † | | 2010 | 96 | 7.38 |
| 2004 | 70 | **5.38** † | | 2011 | 79 | **6.08** † |
| 2005 | 95 | 7.31 | | 2012 | 114 | 8.77 |
| 2006 | 216 | 16.62 | | 2013 | 80 | **6.15** † |
| 2007 | 105 | 8.08 | | 2014 | 97 | 7.46 |
| 2008 | 112 | 8.62 | | 2015 | 80 | **6.15** † |
| 2009 | 75 | **5.77** † | | 2016 | 78 | **6.00** † |

**7 of 14 cohorts fall below the checklist's hard floor of 7 treated units per covariate.**
The smallest is the 2003 cohort at 3.62. The aggregate looks comfortable — 1,344 treated
over 13 covariates is 103 — which is precisely the trap the checklist warns about: the
aggregate passes while the binding cohort fails.

The course lab's own probe asked a different question ("does it return non-NA cells?") and
got a different answer ("yes, 210/210"). Both are true. Non-NA is not the same as
well-identified, and the EPV screen is the one that says so.

**Remediation is NOT yet recorded.** The checklist requires it when EPV < 7, and the
options are: drop covariates for the small cohorts, run the small cohorts with RA only, or
declare them IPW-unidentified. This is flagged as open, not resolved.
