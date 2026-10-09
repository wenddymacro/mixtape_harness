# 30b_build_panel_clean.R — build the main estimation panel for brazil_caps.
# REQUIRES: haven >= 2.5, data.table >= 1.14
#
# This is the ONE place the analysis sample is defined. Downstream scripts
# (31_csdid_main.R) read this file and do not re-filter, so the sample cannot
# drift between steps.
#
# SAMPLE DEFINITION (from the course's brazil.R / the authors' replication):
#   keep  g == 0                        never treated      -> the comparison group
#   keep  g in 2003..2016               treated with a pre-period
#   drop  g == 2002                     ALWAYS treated — 2002 is the first panel
#                                       year, so there is no pre-treatment period
#                                       to identify an effect from.
#
# OUTCOME: homicide_rate = sim_agressao, homicides per 10,000 people.
# COVARIATES: the 13 that the course lab found the estimator tolerates (the lab's
#   14th, poptotaltrend, makes att_gt return an all-NA ATT surface on this data —
#   see the lab's control-by-control probe). Recorded here rather than discovered
#   by trial at estimation time.
#   rural = popruraltrend / ano, exactly as the lab defines it.
#
# Input : data/raw/brazil.dta            (sealed, read-only)
# Output: data/derived/panel_clean.csv
#         data/derived/panel_clean_notes.txt   (sample ledger: rows in / out / why)

suppressPackageStartupMessages({ library(haven); library(data.table) })

RAW <- "data/raw/brazil.dta"
OUT <- "data/derived/panel_clean.csv"
NOTES <- "data/derived/panel_clean_notes.txt"
stopifnot("brazil.dta not found — intake it first" = file.exists(RAW))

COVS <- c("rural", "theil2000trend", "lnsaudepctrend",
          "pop20a29anoslino", "pop40a49anoslino", "pop50a59anoslino",
          "pop60a69anoslino", "pop70a79anoslino",
          "pop10a19anosnino", "pop20a29anosnino", "pop50a59anosnino",
          "pop60a69anosnino", "pop70a79anosnino")

dt <- as.data.table(haven::read_dta(RAW))
n_raw <- nrow(dt)

# --- cohort + derived variables ---------------------------------------------
dt[, g := as.integer({ yrs <- ano[ca == 1 & !is.na(ca)]; if (length(yrs)) min(yrs) else 0L }), by = cod]
dt[, rural := popruraltrend / ano]
dt[, homicide_rate := sim_agressao]

# --- the sample gate ----------------------------------------------------------
dropped_always <- dt[g == 2002, uniqueN(cod)]
d <- dt[g != 2002]

keep <- c("cod", "uf", "ano", "pop_", "g", "ca", "homicide_rate",
          "sim_suicide", "sim_overdose", "sim_diseases_despair", COVS)
missing <- setdiff(keep, names(d))
stopifnot("panel_clean: expected columns missing from brazil.dta" = !length(missing))
d <- d[, ..keep]

# --- ledger -------------------------------------------------------------------
lines <- c(
  "panel_clean — sample ledger (brazil_caps)",
  # NOTE: no wall-clock timestamp here on purpose. This ledger is a tracked pipeline
  # artifact, and a line that changes every run makes the artifact permanently
  # unreproducible -- the official pipeline reports it CHANGED forever and the
  # verdict badge stops meaning anything. When the run happened is recorded in
  # audits/pipeline_runs/run_*.json, which is where a timestamp belongs.
  sprintf("source: %s  (sealed; see data/raw.manifest.sha256)", RAW),
  "",
  sprintf("rows read (raw panel)                 : %d", n_raw),
  sprintf("municipalities read                   : %d", uniqueN(dt$cod)),
  sprintf("municipality-years dropped, g == 2002 : %d  (%d always-treated municipalities,",
          n_raw - nrow(d), dropped_always),
  "                                                no pre-period in this panel)",
  sprintf("rows written (panel_clean.csv)        : %d", nrow(d)),
  sprintf("municipalities written                : %d", uniqueN(d$cod)),
  "",
  sprintf("  never treated (g = 0)               : %d municipalities", uniqueN(d[g == 0, cod])),
  sprintf("  analysis treated (g = 2003..2016)   : %d municipalities", uniqueN(d[g > 0, cod])),
  "",
  sprintf("outcome    : homicide_rate (= sim_agressao, per 10,000)"),
  sprintf("covariates : %d -> %s", length(COVS), paste(COVS, collapse = ", ")),
  sprintf("NA in homicide_rate: %d", sum(is.na(d$homicide_rate))),
  sprintf("NA in rural        : %d", sum(is.na(d$rural))),
  sprintf("panel years        : %d..%d", min(d$ano), max(d$ano)),
  sprintf("years per municipality: min %d, max %d",
          d[, .N, by = cod][, min(N)], d[, .N, by = cod][, max(N)]),
  "",
  "Dropping rule is a stated reason, not a silent shrink: the 2002 cohort is",
  "excluded because a unit treated in the first panel year has no Y(0) to compare to."
)
writeLines(lines, NOTES)
fwrite(d, OUT)

cat(paste(lines, collapse = "\n"), "\n")
cat("\nWrote", OUT, "and", NOTES, "\n")
