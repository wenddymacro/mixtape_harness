# 30c_build_panel_falsif.R — build the falsification (placebo-outcome) panel.
# REQUIRES: haven >= 2.5, data.table >= 1.14
#
# Step 8c of the checklist: same units, same specification, DIFFERENT outcome —
# one that shares the confounders but should not respond to CAPS. CLAUDE.md names
# the deaths-of-despair family as the null outcomes for this study: the reform
# moved homicides through psychiatric admissions, and has no such channel into
# suicide / overdose / deaths of despair.
#
# The sample, covariates and cohort definition are IDENTICAL to panel_clean.csv —
# deliberately. A placebo run on a different sample is not a placebo, because any
# difference could be the sample rather than the outcome.
#
# PRIMARY placebo outcome: sim_diseases_despair  ("deaths of despair per 10,000 people")
# Recorded alongside, for the record: sim_suicide, sim_overdose.
#   NOTE: sim_overdose is ~97% zeros (mean 0.0185); it is carried but a null there
#   is close to uninformative, and the script says so rather than letting a
#   reassuring zero stand in for evidence.
#
# Input : data/raw/brazil.dta            (sealed, read-only)
# Output: data/derived/panel_falsif.csv
#         data/derived/panel_falsif_notes.txt

suppressPackageStartupMessages({ library(haven); library(data.table) })

RAW <- "data/raw/brazil.dta"
OUT <- "data/derived/panel_falsif.csv"
NOTES <- "data/derived/panel_falsif_notes.txt"
stopifnot("brazil.dta not found — intake it first" = file.exists(RAW))

COVS <- c("rural", "theil2000trend", "lnsaudepctrend",
          "pop20a29anoslino", "pop40a49anoslino", "pop50a59anoslino",
          "pop60a69anoslino", "pop70a79anoslino",
          "pop10a19anosnino", "pop20a29anosnino", "pop50a59anosnino",
          "pop60a69anosnino", "pop70a79anosnino")

dt <- as.data.table(haven::read_dta(RAW))
n_raw <- nrow(dt)

dt[, g := as.integer({ yrs <- ano[ca == 1 & !is.na(ca)]; if (length(yrs)) min(yrs) else 0L }), by = cod]
dt[, rural := popruraltrend / ano]

# same sample gate as 30b — one definition, applied twice
d <- dt[g != 2002]

d[, placebo_rate := sim_diseases_despair]

keep <- c("cod", "uf", "ano", "pop_", "g", "placebo_rate",
          "sim_suicide", "sim_overdose", COVS)
stopifnot("panel_falsif: expected columns missing" = !length(setdiff(keep, names(d))))
d <- d[, ..keep]

overdose_zero_share <- mean(d$sim_overdose == 0, na.rm = TRUE)

lines <- c(
  "panel_falsif — sample ledger (brazil_caps, Step 8c placebo outcome)",
  # no wall-clock timestamp: see the note in 30b_build_panel_clean.R
  sprintf("source: %s  (sealed; see data/raw.manifest.sha256)", RAW),
  "",
  sprintf("rows read (raw panel)                 : %d", n_raw),
  sprintf("rows written (panel_falsif.csv)       : %d", nrow(d)),
  sprintf("municipality-years dropped, g == 2002 : %d", n_raw - nrow(d)),
  sprintf("municipalities written                : %d", uniqueN(d$cod)),
  "",
  "primary placebo outcome : placebo_rate = sim_diseases_despair",
  "                          label: 'deaths of despair per 10,000 people'",
  sprintf("                          mean %.4f, NA %d", mean(d$placebo_rate, na.rm = TRUE), sum(is.na(d$placebo_rate))),
  sprintf("secondary              : sim_suicide   (mean %.4f, NA %d)",
          mean(d$sim_suicide, na.rm = TRUE), sum(is.na(d$sim_suicide))),
  sprintf("secondary              : sim_overdose  (mean %.4f, %.1f%% exact zeros, NA %d)",
          mean(d$sim_overdose, na.rm = TRUE), 100 * overdose_zero_share, sum(is.na(d$sim_overdose))),
  "",
  "CAVEAT recorded rather than buried: sim_overdose is almost all zeros, so a",
  "null on it is near-uninformative. The informative placebo is sim_diseases_despair.",
  "",
  sprintf("covariates : %d (identical to panel_clean.csv)", length(COVS)),
  sprintf("sample and cohort definition: identical to panel_clean.csv (g != 2002)")
)
writeLines(lines, NOTES)
fwrite(d, OUT)

cat(paste(lines, collapse = "\n"), "\n")
cat("\nWrote", OUT, "and", NOTES, "\n")
