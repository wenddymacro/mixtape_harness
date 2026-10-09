# 00_packages — findings

## Step 0 is a Gawande pause, and it is NOT satisfied

The versions below were read by the AI from `packageVersion()` in this session. That is
data collection, not verification. **The Step 0 checkbox stays unchecked until Scott looks
at each version and types it himself** — the typing is the verification.

| package | installed | upstream (CRAN, checked 2026-10-09) | gap |
|---|---|---|---|
| did | 2.1.1 | 2.5.1 | four minor versions |
| HonestDiD | 0.2.0 | 0.2.8 | three minor versions |

R itself is 4.1.2 (2021-11-01) — the environment the whole run happened in, and a reason to
be careful about "just upgrade it".

## The gap stopped being paperwork at Step 8d

Everything ran, but Step 8d (Rambachan-Roth sensitivity) could not:

- `aggte()` in did 2.1.1 returns **no variance-covariance matrix**.
- `HonestDiD::createSensitivityResults()` requires the full VCV — the bounds are joint in
  the event-study coefficients, so reported SEs are not a substitute.
- The influence function is exposed, and it was **tested rather than trusted**: its column
  norms do not reproduce `se.egt` under any constant normalisation (~21% relative spread),
  so a `sigma` built from it would have been invented.

Recorded in full at `audits/incidents/2026-10-09_brazil_caps_honestdid-blocked.md`.
Resolution is the researcher's call: upgrade did, or bootstrap the VCV.

## A second, quieter reason this step exists

`aggte()` on an `att_gt` object **reloaded from disk** fails in 2.1.1 with
`object of type 'S4' is not subsettable` — the serialised influence function loses its
class. So `31_` exports the dynamic pieces it computed in-session and `32_` reads that
export. Only visible when a pipeline is genuinely split across scripts.

## Deliberate decision recorded rather than defaulted

`31_csdid_main.R` **refuses to call the estimator** unless
`ACKNOWLEDGE_DID_VERSION_GAP=1` is set. The official runner sets it. The gate is friction
on purpose: nobody runs the estimator on a version behind upstream without saying so out
loud.

## Open

- Scott to look at the two versions and type them into the checklist frontmatter.
- Scott to answer the version question: run on 2.1.1 as documented, or upgrade.
