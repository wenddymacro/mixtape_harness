# 04_sample_shares — findings

## The counts, and where they come from

From `data/derived/gvar_county.csv` (built by `scripts/r/30_build_gvar.R`):

| group | municipalities |
|---|---|
| never treated (g = 0) — comparison | 3,836 |
| already treated in 2002 — **excluded** | 296 |
| analysis-treated (g = 2003…2016) | 1,344 |
| **total** | **5,476** |

These reconcile with the Step 2 map and with the anchor in `CLAUDE.md`. The sample ledger
in `data/derived/panel_clean_notes.txt` carries the row-level arithmetic:
82,140 rows read → 77,700 written → 4,440 dropped, all of them the 296 always-treated
municipalities × 15 years. Nothing else shrank, and no municipality is in the analysis
sample without appearing in the map.

## Cohort shares, which is what drives the aggregation

Callaway-Sant'Anna weights each cohort's ATT(g,t) by N_g / N_T in the simple aggregation,
so the shares below are the actual weights on the headline number:

| cohort | N | share | | cohort | N | share |
|---|---|---|---|---|---|---|
| 2003 | 47 | 0.035 | | 2010 | 96 | 0.071 |
| 2004 | 70 | 0.052 | | 2011 | 79 | 0.059 |
| 2005 | 95 | 0.071 | | 2012 | 114 | 0.085 |
| **2006** | **216** | **0.161** | | 2013 | 80 | 0.060 |
| 2007 | 105 | 0.078 | | 2014 | 97 | 0.072 |
| 2008 | 112 | 0.083 | | 2015 | 80 | 0.060 |
| 2009 | 75 | 0.056 | | 2016 | 78 | 0.058 |

**Dominant cohort: 2006, at 16.1% of the analysis-treated sample** — nearly one unit in six
of the headline ATT. A cohort this large is worth naming, because the headline number moves
with it more than with any other.

## The share that is missing on purpose

The 2002 cohort (296 municipalities) is 18.0% of the ever-treated population and **0% of the
analysis**. Those are not missing data; they are units with no pre-period, and excluding
them is the difference between "we cannot identify their effect" and "we pretend their
effect is zero".
