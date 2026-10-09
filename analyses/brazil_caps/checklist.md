---
slug: brazil_caps
started_date: 2026-10-09
estimator: CS-DiD
status: in_progress  # in_progress | complete | abandoned
target_population: Brazilian municipalities 2002–2016, ATT on the ever-treated (CAPS adopters), never-treated as the comparison group
treatment_definition: first year a municipality has a CAPS centre (gvar g = min year with ca==1; 0 = never treated)
time_window: 2002-01-01 to 2016-12-31

packages:
  # Step 0: the user has TYPED these in after looking with his own eyes.
  # STATUS 2026-10-09: the AI ran packageVersion() and pasted what it saw. That is
  # NOT the Gawande pause. The pause is Scott looking at the version and typing it
  # himself; until he does, the Step 0 checkbox below stays unchecked.
  - name: did
    installed_version: "2.1.1"
    install_source: "CRAN (pre-existing install, R 4.1.2; site library /Library/Frameworks/R.framework/Versions/4.1/Resources/library)"
    install_date: "unknown — the installed DESCRIPTION carries no date and the install predates this session; not invented here"
    required_version: ">= 2.5.1"
    url: https://github.com/bcallaway11/did
    description: Callaway-Sant'Anna doubly-robust DiD with multiple periods and groups.
    behavior_note: "OPEN — not answered. What 2.1.1 does that the version before it did not has not been read from the changelog. Rule: if I cannot answer this, I am using human capital I do not have."
    known_bugs:
      - version: "2.3.0"
        note: "CRAN release silently fails ATT(g,t) cells with bogus 'singular design matrix' warnings; rcond is nowhere near machine epsilon. Fixed in 2.3.1.907 on GitHub. This is the template's recorded example, NOT a claim about 2.1.1 — but it is why the version gap matters."
      - version: "2.1.1 (observed here, 2026-10-09)"
        note: "aggte() returns NO variance-covariance matrix, which blocks HonestDiD (Step 8d); and aggte() on an att_gt object reloaded from disk fails with \"object of type 'S4' is not subsettable\"."
    upstream_checked: "2026-10-09 — CRAN DESCRIPTION reports Version 2.5.1; installed here is 2.1.1, four minor versions behind."
  - name: HonestDiD
    installed_version: "0.2.0"
    install_source: "CRAN (pre-existing install, R 4.1.2)"
    install_date: "unknown — see above; not invented"
    required_version: ">= 0.2.8"
    url: https://github.com/asheshrambachan/HonestDiD
    description: Rambachan-Roth (2024 RESTUD) sensitivity to violations of parallel trends.
    behavior_note: "OPEN — not answered."
    upstream_checked: "2026-10-09 — CRAN DESCRIPTION reports Version 0.2.8; installed here is 0.2.0."

open_gates:
  - id: step0-version-gap
    raised: 2026-10-09
    rule: "CLAUDE.md / checklist Step 7b — if installed < required, STOP and ask the user before installing or upgrading. Do not silently install or upgrade."
    state: "did 2.1.1 < 2.5.1 upstream; HonestDiD 0.2.0 < 0.2.8 upstream. R here is 4.1.2 (2021). No upgrade has been attempted. The estimator was run anyway with ACKNOWLEDGE_DID_VERSION_GAP=1 on the researcher's instruction to complete a full run, and the failure of Step 8d is the measured cost of not upgrading."
    awaiting: "Scott's decision — (a) keep 2.1.1 and accept Step 8d blocked, (b) upgrade did and re-run 31_/32_, or (c) bootstrap the event-study VCV."
  - id: epv-below-floor
    raised: 2026-10-09
    rule: "Step 3 EPV — if smallest-cohort EPV < 7, remediation must be recorded."
    state: "7 of 14 cohorts have EPV < 7; smallest is the 2003 cohort at 47/13 = 3.62. The estimator returned 210/210 finite cells regardless, which is exactly why non-NA is not the same as identified."
    awaiting: "Remediation: drop covariates for the small cohorts, run them RA-only, or declare them IPW-unidentified."
  - id: covariates-inherited-not-elicited
    raised: 2026-10-09
    rule: "Step 3 requires running the /covariates interview before adding any covariate."
    state: "NOT run. The 13 covariates were inherited from the course replication, which is a different justification from an elicited set of X that drive E[Y(0)] trends."
    awaiting: "Whether to run /covariates and reconcile, or accept the inherited list with the deviation recorded."
  - id: sign-of-att
    raised: 2026-10-09
    rule: "The result must be reported as found, and a discrepancy with the published result must be surfaced, not smoothed."
    state: "Simple ATT = +0.2098 (more homicides), opposite in sign to the published negative effect. Unreconciled. Four candidate explanations listed in stages/07_estimator_eventstudy/findings.md."
    awaiting: "Reconciliation against the paper's own specification."
---

# DiD Checklist — brazil_caps

Instance of `checklists/did_checklist.md` (Cunningham Checklist). **Walked end to end on
2026-10-09 against the real Dias & Fontes (2024) replication panel** — a full run: 10 pipeline
steps, all clean, 159 s, 23 artifacts reproduced byte-identically.

**Dataset.** `data/raw/brazil.dta`, sealed read-only, SHA-256
`a90429b8d135050afdd6d51cccec5d4a2ba81f5096c5989de0d2f75b88f290c5`.
82,140 municipality-years × 117 variables, 5,476 municipalities, 2002–2016.

**Path note (conflict to resolve).** `CLAUDE.md`'s running-example section says to put this file
at `analyses/brazil_caps/data/raw/brazil.dta`. The shipped scripts and `dashboard_server.py`'s
`PIPELINE_SCRIPTS` all read the top-level `data/raw/brazil.dta`. This run follows the
scripts+dashboard convention so the wired pipeline works; the divergence is recorded rather
than silently chosen.

**VERDICT ON THIS RUN: the harness did its job, and the run is NOT sign-off ready.**
Three gates are open: the version gap (which measurably killed Step 8d), the EPV floor
(7 of 14 cohorts), and the sign of the ATT (opposite to the published result).

## 0. Package preflight — the user looks (Gawande pause)

- [ ] **For every estimation package: I ran `packageVersion("<pkg>")` and typed the result into the frontmatter.**
      → NOT DONE. The AI read the versions and pasted them. The human pause has not happened.
- [ ] **Install source typed.** → filled by the AI, not by hand.
- [ ] **Behaviour note for *this version*.** → **OPEN for both packages.** Neither changelog has been read.
- [x] **Every estimation script declares `# REQUIRES:` at the top.** → yes: `31_csdid_main.R`,
      `32_csdid_falsif.R`, `30*_*.R`, `06_power.R`, `00_bite_inspect.R`, `01_*`, `02_*`.
- [ ] **I have read the `packages:` block aloud or written it on paper.**

**Deliverable:** frontmatter `packages:` block — present, but not human-verified.
**Measured cost of the open gate:** Step 8d produced no numbers at all.

## 1. Target estimand
- [x] Estimand: ATT(g,t), aggregated to event time
- [x] Population: the 1,344 ever-treated municipalities (2003–2016 cohorts)
- [x] Population weight: **no** — outcome is already a per-10,000 rate; aggregation weights come from `did` cohort shares
- [x] Why this estimand: the policy question is what a municipality gets from adopting
- [x] Unit of observation: municipality (`cod`)
- [x] Time unit: year (`ano`)

**Deliverable file:** decision recorded; see `stages/01_target/findings.md`

## 2. Bite
- [x] First-order effects named: institutional admissions fall, care moves to the community
- [x] Where and when: national time series + state first-difference maps
- [x] Is there a first stage: yes — 47 municipalities in 2003 rising to 216 in 2006
- [x] Assignment mechanism: staggered municipal adoption (raw `ca` agrees with derived `g` on 100% of rows)
- [x] Staggered: panelView rollout figure

**Deliverable files:**
- Figure: `output/figures/brazil_caps_bite.png`
- Figure: `output/figures/brazil_caps_firstdiff_schiz.png`
- Figure: `output/figures/brazil_caps_firstdiff_allmh.png`
- Figure: `output/figures/rollout_panelview.png`

## 3. Covariate selection and balance

- [ ] **Ran `/covariates`** → **NOT RUN.** Deviation recorded; the 13 covariates are inherited
      from the course replication.
- [x] Covariates list: `rural, theil2000trend, lnsaudepctrend, pop20a29anoslino, pop40a49anoslino,
      pop50a59anoslino, pop60a69anoslino, pop70a79anoslino, pop10a19anosnino, pop20a29anosnino,
      pop50a59anosnino, pop60a69anosnino, pop70a79anosnino`
- [x] Theoretical justification recorded — with the caveat that "the replication uses it" is not
      the same justification as "these X drive E[Y(0)] trends"
- [x] Source data verified (all 13 confirmed present in `brazil.dta`)

### Balance and overlap
- [x] Control group: **not-yet-treated** (rationale in Step 7a)
- [x] Propensity-score overlap figure → `output/figures/pscore_main.png`
- [x] Normalized-differences table → `output/tables/balance_main.tex`. **13 of 13 covariates exceed |0.25|**; worst is `pop60a69anoslino` at −0.757
- [x] Trimming rule recorded: **none applied, none needed** — 0 controls with pscore > 0.995
- [x] Perfect separation checked: **no** — supports overlap (treated min 0.0028, control max 0.9851)

### EPV check — within cohort, not total
- [x] EPV_g = n_g / k computed for every cohort (k = 13)
- [x] Smallest-cohort EPV recorded: **3.62** (cohort 2003, n = 47)
- [ ] **Remediation recorded** → **NOT DONE.** 7 of 14 cohorts are below the floor of 7. Open gate.
- [x] Confirmed computed on within-cohort counts: the aggregate is 103.4 and passes comfortably while 7 cohorts fail — the exact trap the checklist names

**Deliverable files:**
- Figure: `output/figures/pscore_main.png`
- Table: `output/tables/balance_main.tex`

## 4. Sample shares
- [x] Counts: 1,344 treated / 3,836 never-treated / 296 excluded (with reason)
- [x] Treated units by cohort and N_g/N_T shares
- [x] Dominant cohort named: **2006, 16.1%**
- [x] N's reconcile with Step 2's map and with the CLAUDE.md anchor

**Deliverable file:** `output/tables/cohort_rollout.tex`

## 5. Outcome trends by group
- [x] Mean outcome by cohort plotted over the **pre-treatment window only** — post-adoption
      years are excluded from the figure on purpose
- [x] Visual inspection documented: slopes broadly parallel, levels differ; the 2003 cohort has
      a single pre-year so its pre-trend is not assessable
- [ ] Optional pre-period 2×2s: not run

**Deliverable file:** `output/figures/outcome_by_cohort.png`

## 6. Power calculation
- [x] Economically meaningful effect size: the observed around-adoption change (0.5238 unweighted,
      0.5091 pop-weighted) — **flagged as a judgment call for the researcher, not asserted**
- [x] Minimum detectable effect: **0.1734** homicides per 10,000 (80% power, 5% two-sided)
- [x] Powered: **yes** — MDE is 33% of the benchmark, so a null would have been informative
- [x] Recorded **before** Step 7 ran, and containing no post-treatment outcome

**Deliverable file:** `output/figures/brazil_caps_power.png` (+ `data/derived/power_notes.txt`)

## 7. Estimator and event study

### 7a. Select
- [x] Estimator chosen: **Callaway-Sant'Anna**, doubly-robust, not-yet-treated, universal base period
- [x] Rationale recorded: staggered timing + heterogeneous dynamic effects make TWFE's
      already-treated-as-controls problem binding

### 7b. Preflight (run BEFORE any estimator call)
- [ ] **Package version against upstream** → **FAILED: 2.1.1 < 2.5.1.** Run proceeded with
      `ACKNOWLEDGE_DID_VERSION_GAP=1` on the researcher's instruction; documented deviation.
- [x] Encoding alignment: `ano` and `g` both integer, never-treated = 0
- [x] Universal-baseline reference cells understood (t = g−1 → ATT 0, SE NA)
- [ ] **EPV vs covariate count** → **FAILED for 7 of 14 cohorts**
- [ ] **Unconditional null check (`xformla = ~1`)** → **NOT RUN** as its own specification
- [x] One failed cell reproduced manually: **N/A** — 210/210 cells finite, 0 NA

### 7c. Run and event study
- [x] Estimator run on the validated panel (210 cells, 0 NA)
- [x] Universal baseline: reference period marked hollow, not estimated
- [x] Event-study figure with descriptive labels and units
- [x] Simple-average ATT reported: **+0.2098 (SE 0.0654)** — not group-size-weighted

**Deliverable files:**
- Figure: `output/figures/csdid_event_study_main.png`
- Table: `output/tables/csdid_main_results.csv`
- Table: `output/tables/csdid_main_aggregates.tex`

## 8. Falsification and sensitivity

### 8a. Pre-treatment leads
- [x] Leads individually insignificant (−5…−2 all cover zero)
- [ ] Leads **jointly** insignificant → **BLOCKED**, same missing VCV as 8d
- [x] Visual: flat and clustered around zero

### 8b. Placebo group
- [ ] **NOT RUN**

### 8c. Placebo outcome
- [x] Placebo outcome identified and rationale recorded: `sim_diseases_despair`, the null
      outcome CLAUDE.md names for this study
- [x] Identical specification run on the identical sample
- [x] Placebo ATT null and insignificant: **−0.0145, SE 0.0355, p = 0.684**
- [ ] Reported alongside the main ATT in a manuscript: no manuscript yet

**Deliverable files:** `output/figures/csdid_event_study_falsif.png`,
`output/tables/csdid_falsif_results.csv`, `output/tables/csdid_falsif_aggregates.tex`

### 8d. Rambachan-Roth sensitivity
- [ ] HonestDiD → **BLOCKED BY THE ESTIMATOR VERSION.** No numbers produced.
      `output/tables/brazil_caps_sensitivity.tex` **does not exist**, and its absence is
      visible on the dashboard. See `audits/incidents/2026-10-09_brazil_caps_honestdid-blocked.md`.
- [ ] Bounds at M̄ = 0, 1, 2
- [ ] Breakdown M̄

### Step 8 sign-off
- [x] At least one of 8b or 8c ran (8c, and it passed)
- [ ] All falsifications reported, including any that fired → nothing fired; 8d is outstanding

## 9. Rerun
- [x] The estimator ran cleanly — **N/A for the estimator** (no NAs, no singular-matrix warnings)
- [x] Not N/A for the code: 4 code defects and 2 harness defects were found and fixed at the
      root, all recorded in `stages/09_rerun/findings.md`

## Sign-off

**NOT SIGNED OFF.** The canonical artifact `analyses/brazil_caps/manifest.yaml` has not been
written, and should not be until the three open gates in the frontmatter are answered.

- [x] Steps 1–8 have deliverables **or a documented reason they do not**
- [x] Step 4 N's reconcile with Step 2's map
- [x] Step 6 power statement recorded before Step 7 ran
- [x] Step 7c estimator matches the Step 7a choice
- [ ] Step 7b preflight passed → **NO** (version gate and EPV gate both failed; documented instead)
- [ ] Step 8 bounds reported and discussed → **8d blocked**
- [ ] `/referee2 drift` returns Clean → not run
- [ ] `scripts/r/_manifest.R::write_manifest("brazil_caps")` runs → **the helper does not exist
      in this repo**; the template references it but it was never shipped. Another open item.
- [ ] A card per defended claim → none filed; the sign of the ATT is not yet defended
- [ ] Frontmatter `status` updated to `complete`
