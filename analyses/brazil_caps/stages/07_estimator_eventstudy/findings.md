# 07_estimator_eventstudy — findings

## 7a. The choice

**Callaway-Sant'Anna** (`did::att_gt`), doubly-robust, control group = **not-yet-treated**,
universal base period, 13 baseline covariates, `bstrap = TRUE, biters = 1000`.

Why this estimator for the Step 1 ATT: treatment timing is staggered across 14 cohorts and
effects are plausibly heterogeneous and dynamic. TWFE with staggered timing is biased toward
already-treated units being used as controls, which is exactly the failure this design is
exposed to. CS-DiD identifies ATT(g,t) off clean not-yet-treated comparisons and aggregates
to event time. Not-yet-treated is chosen over never-treated because it is the larger and more
contemporaneous comparison group here.

## 7b. Preflight — one sub-check did NOT pass

| check | result |
|---|---|
| Package version vs upstream | **FAIL** — did 2.1.1, upstream 2.5.1 |
| Encoding: `tname`/`gname` same integer scale, never-treated = 0 | pass — `ano` integer, `g` integer, 0 = never |
| Universal-baseline reference cells understood (t = g−1 → ATT 0, SE NA) | pass — visible as the hollow marker at −1 |
| EPV vs covariate count | **FAIL for 7 of 14 cohorts** (Step 3) |
| Unconditional null check (`xformla = ~1`) | *not run separately* — the covariate run returned 210/210 finite cells, which is what that check exists to establish, but the null specification itself was not fitted |
| One failed cell reproduced manually | **N/A** — no cell failed. 210 of 210 finite, 0 NA |

Two failures and one omitted check. The estimator was run anyway, on the researcher's
instruction to complete the run, with
`ACKNOWLEDGE_DID_VERSION_GAP=1` required by the script. **This is a documented deviation,
not a passed gate.**

That the estimator returned no NA cells while 7 cohorts fail the EPV screen is the point:
"it ran" and "it is well-identified" are different claims.

## 7c. The result

- **ATT(g,t) cells:** 210, of which **210 finite and 0 NA**.
- **Simple average ATT: +0.2098**, SE 0.0654, 95% CI [0.0817, 0.338].
- **Dynamic (average post-treatment): +0.2746**, SE 0.1346, 95% CI [0.0108, 0.5384].
- Uniform critical value used for the bands: **2.8783** (not 1.96).

Event time, in homicides per 10,000 (uniform bands):

```
 -5   +0.04   [-0.12, +0.20]      +1   +0.12   [-0.00, +0.24]
 -4   -0.05   [-0.19, +0.10]      +2   +0.15   [+0.00, +0.30]  *
 -3   -0.01   [-0.14, +0.11]      +3   +0.17   [-0.01, +0.35]
 -2   +0.02   [-0.10, +0.14]      +4   +0.22   [+0.03, +0.42]  *
 -1    0.00   (reference)         +5   +0.22   [-0.00, +0.44]
```

**The leads are flat and individually insignificant**, which is 8a's evidence. A formal
*joint* test of the leads is not reported, because it needs the coefficient
variance-covariance matrix and this `did` version does not expose one — the same blocker
that stops Step 8d.

## The sign, which is the thing to look at

**The estimate is positive: adoption is associated with MORE homicides per 10,000**, not
fewer. This is the opposite sign to the published result the panel comes from.

It has not been reconciled, and it should not be smoothed over. Candidates worth checking,
in order of how cheap they are to test:

1. **Sample and comparison group.** This run uses not-yet-treated controls and the 2003–2016
   cohorts; the paper's own specification may differ.
2. **The teaching panel is a reduced extract.** 117 variables, anonymised `cod`, no map key —
   it may not reproduce the published sample exactly.
3. **The outcome.** `sim_agressao` is homicides per 10,000 with a mean of 1.63 and a long
   right tail; the paper's headline may use a transform or a restricted sample.
4. **Something real about the version gap.** Unlikely to flip a sign on its own, but not
   excludable while the version question is open.

Recorded as an open question rather than resolved in the write-up.
