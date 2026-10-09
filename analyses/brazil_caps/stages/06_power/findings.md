# 06_power — findings

## The question, asked before the answer exists

Could this design detect an effect of a meaningful size? Asked here, in Step 6, so the
answer is not reverse-engineered from the Step 7 estimate.

The calculation is estimator-free and looks at no post-treatment outcome:

MDE = (z_{0.975} + z_{0.80}) × σ(Δ) × √(1/N_T + 1/N_C)

- σ(Δ) = **1.9531** — SD of the one-year change in homicide_rate among never-treated
  municipalities, 2002–2005, from 11,508 municipality-pairs.
- N_T = 1,344, N_C = 3,836.
- **MDE = 0.1734 homicides per 10,000** (80% power, 5% two-sided).

## Against a benchmark from the data, not from taste

The benchmark is Step 2's own bite number: the mean within-municipality change in homicides
around adoption, **0.5238 unweighted / 0.5091 population-weighted**. The MDE is **33% of
the benchmark**, so the design could detect a change a third the size of the raw
around-adoption movement.

**Powered: yes**, on this benchmark — and a null would therefore have been informative
rather than merely inconclusive.

## Two things this number is not

1. **It is not the ATT.** The benchmark is the raw association around adoption, which
   contains the effect *plus* whatever differential trend exists. It says how big the
   visible movement is, not how much of it is causal.
2. **It is conservative.** The MDE is built for a one-year change contrast at these group
   sizes. The CS-DiD estimate averages many group-time cells, which is a lower-variance
   quantity, so the true MDE is smaller than 0.1734. Stated because a power number without
   its assumptions is a decoration.

## The judgment this leaves open

Choosing the *economically meaningful* effect size is a researcher's call, not a script's.
The benchmark used here is the honest default available in the data; if a 10% reduction in
the homicide rate is the policy target instead, that number should replace it and the
"powered?" verdict be recomputed.
