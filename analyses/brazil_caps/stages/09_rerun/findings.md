# 09_rerun — findings

## Rerun needed? Partly.

The estimator itself did **not** misbehave. `att_gt` returned 210 of 210 cells finite with
**0 NA**, no singular-matrix warnings, and the pre-period leads are flat. By the criterion
in this step — NAs, singular-matrix warnings, or patterns that do not square with the data —
Step 9 is **N/A for the estimator**.

## But four things did break, and they are recorded here rather than lost

These were failures of the code and of the harness, not of the estimator. Each was found by
running, and each was fixed at the root rather than worked around:

| what broke | cause | resolution |
|---|---|---|
| EPV printed 1,344 for every cohort | `data.table` aggregation with the grouping variable inside `.(...)` and no `by=`, so `.N` was the whole filtered set | `by = .(cohort = g)` — then the real answer appeared (7 of 14 cohorts below floor) |
| Cohort shares table: same 1,344-row shape | identical missing-`by=` bug, second occurrence | same fix |
| Probit: "supplied 5177 items to be assigned to 5180" | 3 municipalities have NA in a baseline covariate; `predict()` returns fewer rows | fit on `complete.cases` and **name the 3 dropped cods** (125, 851, 3627) |
| `panelView` not found | the exported function is `panelview` in panelView 1.1.16 | fixed the call |

## And two harness defects, which are the more interesting ones

1. **The official pipeline reported timestamped artifacts as CHANGED forever.** The three
   `*_notes.txt` ledgers carried a `generated: <wall clock>` line, and PDF writers embed a
   creation timestamp — so re-running produced different bytes every time and the verdict
   badge would have been permanently red on artifacts that *are* reproducible. Fixed by
   removing the timestamp from the ledgers (when a run happened belongs in
   `audits/pipeline_runs/`, not in an artifact) and by excluding PDFs from the byte-verdict
   set with the reason written into the runner. **A badge that is always red is a badge
   nobody reads.**
2. **`no-offbook-exhibit` blocked a benign command.** `Rscript -e 'cat(packageVersion(...))'`
   in the same shell line as an `ls output/figures/` tripped the guard, because the check
   regexes the whole command string: inline interpreter present AND an `output/figures` path
   present. No plot was being drawn. Written up in `dsh-guards/README.md` as an over-block
   found in anger, with three verified workarounds.

## One deliberate non-fix worth recording

`32_csdid_falsif.R` calls `aggte()` only on an export produced in the fitting session,
because in did 2.1.1 `aggte()` on a reloaded `att_gt` object dies with
`object of type 'S4' is not subsettable`. The fix is a workaround for a version defect, not
a design choice, and it is labelled as such at the call site.
