# 02_bite — findings

## What the treatment is, and that it arrived

CAPS (Centros de Atenção Psicossocial) are community mental-health centres. Brazil's 2002
psychiatric reform rolled them out municipality by municipality, which creates the
staggered variation. The raw treatment indicator `ca` and the cohort definition derived
from it agree on **100% of the 77,700 analysis rows** — checked, not assumed.

- Rollout: 47 municipalities in 2003, rising to 216 in 2006, tapering to 78 in 2016.
- 1,344 treated in the analysis window; 296 already treated in 2002 (excluded);
  3,836 never treated.
- These reproduce the anchor in `CLAUDE.md` exactly (5,476 total; 1,640 ever-treated;
  296 in 2002; 3,836 never).

## The two sides of the bite

The reform moves care from the institution to the community, so the bite is two-sided:

- **Institutional care falls.** Population-weighted national psychiatric admissions per
  10,000 fell from **17.66 (2002) to 10.47 (2016), down 41%**. The schizophrenia subset,
  the margin the authors tie to homicides, fell from **7.97 to 3.43, down 57%**.
- **Where it fell.** The state first-difference map shows most states negative. Rio Grande
  do Sul (−7.0) and Roraima (−4.5) are the exceptions; Piauí and Rio de Janeiro fall least.
  Against the four states that rose, this is a national decline with real geography in it,
  not a uniform tide.

## Two limits stated rather than smoothed

1. **The teaching panel has no municipality map key.** `cod` is a 1..5476 index with no
   IBGE code and no name, so a 5,476-municipality choropleth is impossible here. The map is
   drawn at the 27 states via the real `uf` codes. A municipality map needs the geocoded
   replication file.
2. **State aggregation is population-weighted** by baseline population, so a state's colour
   is where its people are, not where its municipalities are.

## A third limit that matters more downstream

This bite is the **national trend** — a fact about Brazil, not a causal claim about CAPS.
The 41% fall is the raw association the estimator later has to survive.
