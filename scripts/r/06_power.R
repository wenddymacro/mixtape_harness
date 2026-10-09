# 06_power.R — Step 6 for brazil_caps: could this design detect a meaningful effect?
# REQUIRES: data.table >= 1.14, ggplot2 >= 3.5
#
# Deliberately estimator-free and post-treatment-free. Step 6 sits BEFORE Step 7
# in the checklist, so the noise scale here is built from
#   (a) year-to-year variation in the outcome among NEVER-TREATED municipalities
#       during the early pre-period, and
#   (b) the benchmark effect size taken from Step 2's bite exhibit (the observed
#       within-municipality change around adoption), which Step 2 is entitled to see.
# Nothing here reads a Step 7 estimate, so the power statement cannot be reverse-
# engineered from the answer it is meant to discipline.
#
# METHOD (stated, because a power number without its assumptions is a decoration):
#   MDE = (z_{1-alpha/2} + z_{1-kappa}) * sigma_delta * sqrt(1/N_T + 1/N_C)
# with sigma_delta the SD of the one-year change in homicide_rate among the
# never-treated, N_T the analysis-treated count and N_C the never-treated count.
# It is a design-based approximation for a one-year change contrast. The real
# CS-DiD averages many group-time cells, so this MDE is CONSERVATIVE (it will
# overstate the smallest detectable effect). Recorded as an assumption, not hidden.
#
# Inputs : data/derived/panel_clean.csv
# Output : output/figures/brazil_caps_power.png
#          data/derived/power_notes.txt

suppressPackageStartupMessages({ library(data.table); library(ggplot2) })
source("scripts/r/_theme_bite.R")

panel <- fread("data/derived/panel_clean.csv")
panel[, g := as.integer(g)]

N_T <- uniqueN(panel[g > 0, cod])
N_C <- uniqueN(panel[g == 0, cod])

# --- (a) noise: one-year changes among the never-treated, early pre-period -----
nt <- panel[g == 0 & ano >= 2002 & ano <= 2005][order(cod, ano)]
ch <- nt[, .(d = diff(homicide_rate)), by = cod]
sigma_delta <- sd(ch$d, na.rm = TRUE)
n_pairs <- nrow(ch)

z <- 1.959964 + 0.8416212      # 95% two-sided, 80% power
mde <- z * sigma_delta * sqrt(1 / N_T + 1 / N_C)

# --- (b) benchmark: the bite-stage within-municipality change -----------------
d <- panel[g >= 2003 & g <= 2016]
fd <- d[, {
  before <- .SD[ano == g[1L] - 1L][["homicide_rate"]][1L]
  after  <- mean(.SD[ano >= g[1L]][["homicide_rate"]], na.rm = TRUE)
  list(before = before, after = after)
}, by = .(cod, g)]
fd <- fd[is.finite(before) & is.finite(after)]
fd[, delta := after - before]
benchmark <- mean(fd$delta)                      # unweighted, the typical municipality
benchmark_pw <- {
  w <- d[ano == 2002, .(cod, w = pop_)]
  j <- fd[w, on = "cod"]                          # attach baseline population
  weighted.mean(j$delta, w = j$w, na.rm = TRUE)   # <- the weight must actually be used
}
stopifnot("pop-weighted and unweighted benchmark are identical: the weight was not applied" =
            !isTRUE(all.equal(benchmark, benchmark_pw)))

cat("=========== STEP 6: power ===========\n")
cat(sprintf("N treated (analysis) : %d\n", N_T))
cat(sprintf("N never-treated      : %d\n", N_C))
cat(sprintf("sigma(delta), never-treated one-year change, 2002-2005: %.4f  (%d municipality-pairs)\n",
            sigma_delta, n_pairs))
cat(sprintf("MDE (80%% power, 5%% two-sided)  : %.4f homicides per 10,000\n", mde))
cat(sprintf("benchmark: mean within-municipality change around adoption = %.4f (unweighted), %.4f (pop-weighted)\n",
            benchmark, benchmark_pw))
cat(sprintf("MDE as a share of the benchmark: %.0f%%\n", 100 * mde / abs(benchmark)))
cat(sprintf("powered? %s\n",
            if (abs(benchmark) > mde) "yes -- the benchmark change exceeds the MDE" else
            "NO -- the benchmark change is smaller than the MDE; a null would be uninformative"))

writeLines(c(
  "power_notes — brazil_caps Step 6",
  # no wall-clock timestamp: see the note in 30b_build_panel_clean.R
  "",
  sprintf("N treated (analysis)  : %d", N_T),
  sprintf("N never-treated       : %d", N_C),
  sprintf("sigma(delta)          : %.4f  (SD of the one-year change in homicide_rate among never-treated, 2002-2005, %d pairs)", sigma_delta, n_pairs),
  sprintf("z (95%%, 80%% power)     : %.4f", z),
  sprintf("MDE                   : %.4f homicides per 10,000", mde),
  sprintf("benchmark, unweighted : %.4f", benchmark),
  sprintf("benchmark, pop-weighted: %.4f", benchmark_pw),
  sprintf("ratio MDE/benchmark   : %.2f", mde / abs(benchmark)),
  "",
  "ASSUMPTION: MDE is for a one-year change contrast at the observed group sizes.",
  "The CS-DiD estimate averages many group-time cells, so this is conservative.",
  "The benchmark is an ASSOCIATION (Step 2 bite), not the ATT -- it says how large",
  "the raw around-adoption change is, which is the quantity a reader would want the",
  "design to be able to detect. Choosing the economically meaningful effect size is",
  "a judgment call and is flagged for the researcher, not asserted here."
), "data/derived/power_notes.txt")

# --- figure -------------------------------------------------------------------
bars <- data.table(
  what = c("Minimum detectable effect\n(80% power, 5% two-sided)",
           "Benchmark: observed change\naround adoption (unweighted)",
           "Benchmark: observed change\naround adoption (pop-weighted)"),
  value = c(mde, benchmark, benchmark_pw)
)
bars[, what := factor(what, levels = what)]
bars[, kind := c("MDE", "Benchmark", "Benchmark")]

p <- ggplot(bars, aes(value, what, fill = kind)) +
  geom_col(width = 0.55) +
  geom_text(aes(label = sprintf("%.3f", value)), hjust = -0.15,
            colour = bite_pal$ink, size = 4.2, fontface = "bold") +
  geom_vline(xintercept = 0, colour = bite_pal$grid, linewidth = 0.5) +
  scale_fill_manual(values = c(MDE = bite_pal$accent, Benchmark = bite_pal$teal)) +
  scale_x_continuous(expand = expansion(mult = c(0, 0.18))) +
  labs(
    title = "Smallest detectable effect vs. the change actually observed",
    subtitle = sprintf("Homicides per 10,000 residents · %s treated vs %s never-treated municipalities",
                       format(N_T, big.mark = ","), format(N_C, big.mark = ",")),
    x = "Homicides per 10,000 residents", y = NULL,
    caption = sprintf("Source: Dias & Fontes (2024) replication panel. MDE = %.3f x sigma(change) x sqrt(1/N_T + 1/N_C), sigma = %.3f from never-treated year-to-year changes, 2002-2005. Design-based approximation; conservative relative to the multi-cell CS-DiD.",
                      z, sigma_delta)
  ) +
  theme_bite()
ggsave("output/figures/brazil_caps_power.png", p, width = 9.6, height = 5.2, dpi = 300, bg = "white")
cat("\nWrote output/figures/brazil_caps_power.png and data/derived/power_notes.txt\n")
