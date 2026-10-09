# 30_build_gvar.R — build the cohort (gvar) file for brazil_caps.
# REQUIRES: haven >= 2.5, data.table >= 1.14
#
# Stage: 04_sample_shares feeds from this; 30b/30c read nothing from it but the
# cohort definition must live in ONE place, so it is computed here and re-used.
#
# g = first year the municipality has a CAPS centre (first year ca == 1), per the
# authors' own definition in the course's load_brazil.R. g == 0 means never treated.
# The 2002 cohort is the ALWAYS-TREATED group: 2002 is the first panel year, so
# those municipalities have no pre-period. They are flagged, not silently dropped.
#
# Input : data/raw/brazil.dta   (sealed, read-only)
# Output: data/derived/gvar_county.csv

suppressPackageStartupMessages({ library(haven); library(data.table) })

RAW <- "data/raw/brazil.dta"
OUT <- "data/derived/gvar_county.csv"
stopifnot("brazil.dta not found — intake it first" = file.exists(RAW))

dt <- as.data.table(haven::read_dta(RAW))
cat(sprintf("read %s: %s rows x %s cols\n", RAW, format(nrow(dt), big.mark = ","), ncol(dt)))

# --- cohort g per municipality ----------------------------------------------
gv <- dt[, .(
  uf            = uf[1L],
  g             = as.integer({ yrs <- ano[ca == 1 & !is.na(ca)]; if (length(yrs)) min(yrs) else 0L }),
  n_years       = .N,
  first_ano     = min(ano),
  last_ano      = max(ano),
  pop_2002      = if (any(ano == 2002)) pop_[ano == 2002][1L] else NA_real_,
  pop_last      = pop_[which.max(ano)]
), by = cod]

gv[, `:=`(
  ever_treated  = g > 0L,
  always_treated = g == 2002L,          # no pre-period in this panel
  analysis_sample = g == 0L | (g >= 2003L & g <= 2016L)
)]

setorder(gv, g, cod)
fwrite(gv, OUT)

# --- report ------------------------------------------------------------------
cat("\n================ COHORT COUNTS ================\n")
tab <- gv[, .N, by = g][order(g)]
tab[, share_of_analysis_treated := ifelse(g >= 2003 & g <= 2016,
                                          N / sum(N[g >= 2003 & g <= 2016]), NA_real_)]
print(tab)

cat(sprintf("\nmunicipalities total      : %s\n", format(nrow(gv), big.mark = ",")))
cat(sprintf("  never treated (g = 0)   : %s\n", format(gv[g == 0, .N], big.mark = ",")))
cat(sprintf("  always treated (g=2002) : %s  [EXCLUDED from analysis]\n", format(gv[g == 2002, .N], big.mark = ",")))
cat(sprintf("  analysis treated (03-16): %s\n", format(gv[g >= 2003 & g <= 2016, .N], big.mark = ",")))
cat(sprintf("  analysis sample total   : %s\n", format(gv[analysis_sample == TRUE, .N], big.mark = ",")))

dom <- tab[g >= 2003 & g <= 2016][which.max(share_of_analysis_treated)]
cat(sprintf("  dominant cohort         : %d  (%.1f%% of analysis-treated)\n",
            dom$g, 100 * dom$share_of_analysis_treated))

cat("\nWrote", OUT, "\n")
