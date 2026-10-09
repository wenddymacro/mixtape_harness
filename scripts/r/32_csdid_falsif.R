# 32_csdid_falsif.R — Step 8 for brazil_caps: placebo outcome + honest sensitivity.
# REQUIRES: did >= 2.1.1, HonestDiD >= 0.2.0, data.table >= 1.14, ggplot2 >= 3.5
#
# Step 8c (placebo outcome): the SAME sample and the SAME specification as the
# main run, on an outcome CAPS has no identified channel into -- deaths of despair
# (CLAUDE.md names this family as the null outcomes for the Brazil study). If the
# design is picking up a real effect rather than a differential trend, this must
# come back null.
#
# Step 8d (sensitivity): Rambachan-Roth via the HonestDiD package proper. NOTE:
# the course's own brazil.R computes its "robust" interval as se + M*se by hand
# while its plot caption claims the Rambachan-Roth bounding method. That is not
# the method, so it is NOT reused here; this script calls HonestDiD and records
# which method and which variance matrix actually produced the numbers.
#
# Inputs : data/derived/panel_falsif.csv, data/derived/csdid_main.rds
# Outputs: output/figures/csdid_event_study_falsif.png
#          output/tables/csdid_falsif_results.csv
#          output/tables/csdid_falsif_aggregates.tex
#          output/tables/brazil_caps_sensitivity.tex
#          output/figures/brazil_caps_sensitivity.png

suppressPackageStartupMessages({
  library(data.table); library(ggplot2); library(did); library(HonestDiD)
})
source("scripts/r/_theme_bite.R")

PANEL_F <- "data/derived/panel_falsif.csv"
MAIN_RDS <- "data/derived/csdid_main.rds"
stopifnot("run 30c_build_panel_falsif.R first" = file.exists(PANEL_F))
stopifnot("run 31_csdid_main.R first" = file.exists(MAIN_RDS))

COVS <- c("rural", "theil2000trend", "lnsaudepctrend",
          "pop20a29anoslino", "pop40a49anoslino", "pop50a59anoslino",
          "pop60a69anoslino", "pop70a79anoslino",
          "pop10a19anosnino", "pop20a29anosnino", "pop50a59anosnino",
          "pop60a69anosnino", "pop70a79anosnino")
XFORM <- as.formula(paste("~", paste(COVS, collapse = " + ")))

# =============================================================================
# STEP 8c — placebo outcome: deaths of despair
# =============================================================================
cat("=========== STEP 8c: placebo outcome ===========\n")
pf <- fread(PANEL_F)
pf[, g := as.integer(g)]
cat(sprintf("panel_falsif: %d rows, %d municipalities\n", nrow(pf), uniqueN(pf$cod)))
cat(sprintf("placebo outcome mean: %.4f (main outcome mean: %.4f)\n",
            mean(pf$placebo_rate, na.rm = TRUE),
            mean(fread("data/derived/panel_clean.csv")$homicide_rate, na.rm = TRUE)))

set.seed(1)
t0 <- Sys.time()
csf <- att_gt(yname = "placebo_rate", tname = "ano", idname = "cod", gname = "g",
              xformla = XFORM, data = as.data.frame(pf),
              est_method = "dr", control_group = "notyettreated",
              base_period = "universal", bstrap = TRUE, biters = 1000)
cat(sprintf("placebo att_gt finished in %.1f min\n", as.numeric(difftime(Sys.time(), t0, units = "mins"))))
saveRDS(csf, "data/derived/csdid_falsif.rds")

csf_simple  <- aggte(csf, type = "simple")
csf_dynamic <- aggte(csf, type = "dynamic")
cat("\n--- placebo simple ATT (should be ~0 and insignificant) ---\n")
print(summary(csf_simple))
cat("\n--- placebo dynamic ---\n")
print(summary(csf_dynamic))

z <- csf_simple$overall.att / csf_simple$overall.se
p_null <- 2 * pnorm(-abs(z))
cat(sprintf("\nplacebo simple ATT = %.4f (se %.4f), z = %.2f, two-sided p = %.3f\n",
            csf_simple$overall.att, csf_simple$overall.se, z, p_null))
cat(sprintf("verdict: %s\n",
            if (is.na(p_null) || p_null > 0.05) "no detectable effect on the placebo outcome"
            else "!! the placebo outcome MOVED -- the design is not clean; report this, do not bury it"))

# --- placebo event study figure ----------------------------------------------
evf <- data.table(egt = csf_dynamic$egt, att = csf_dynamic$att.egt, se = csf_dynamic$se.egt)
critf <- if (!is.null(csf_dynamic$crit.val)) csf_dynamic$crit.val[1] else 1.96
evf[, `:=`(lo = att - critf * se, hi = att + critf * se, is_ref = egt == -1)]
evf[is_ref == TRUE, `:=`(att = 0, lo = 0, hi = 0)]
winf <- evf[egt >= -5 & egt <= 5]

pF <- ggplot(winf, aes(egt, att)) +
  geom_hline(yintercept = 0, colour = bite_pal$grid, linewidth = 0.5) +
  geom_vline(xintercept = -0.5, colour = bite_pal$muted, linetype = "22", linewidth = 0.5) +
  geom_errorbar(aes(ymin = lo, ymax = hi), width = 0.12, colour = bite_pal$accent, linewidth = 0.7) +
  geom_point(data = winf[is_ref == FALSE], colour = bite_pal$accent, size = 2.4) +
  geom_point(data = winf[is_ref == TRUE], colour = bite_pal$ink, fill = "white", shape = 21, size = 3, stroke = 1.1) +
  geom_line(colour = bite_pal$accent, linewidth = 0.5, alpha = 0.6) +
  scale_x_continuous(breaks = seq(-5, 5, 1)) +
  labs(
    title = "Deaths of despair per 10,000: change after a municipality adopts a CAPS",
    subtitle = "Placebo outcome — identical sample, covariates and specification to the homicide run",
    x = "Years relative to CAPS adoption",
    y = "Effect on deaths of despair per 10,000 residents",
    caption = paste(strwrap(sprintf("Source: SIM/DATASUS, Dias & Fontes (2024) replication panel, %s municipalities. Outcome is sim_diseases_despair. Hollow marker at -1 is the reference period by construction.",
                      format(uniqueN(pf$cod), big.mark = ",")), width = 108), collapse = "\n")
  ) +
  theme_bite()
ggsave("output/figures/csdid_event_study_falsif.png", pF, width = 9.6, height = 5.8, dpi = 300, bg = "white")
cat("Wrote output/figures/csdid_event_study_falsif.png\n")

fwrite(evf[, .(egt, att, se, ci_lower = lo, ci_upper = hi, is_reference = is_ref, crit_val = critf)],
       "output/tables/csdid_falsif_results.csv")

fmt <- function(x, d = 3) ifelse(is.na(x), "---", sprintf(paste0("%.", d, "f"), x))
tex <- c(
  "\\begin{table}[htbp]\\centering",
  "\\caption{Placebo outcome: Callaway-Sant'Anna estimates on deaths of despair per 10,000}",
  "\\label{tab:csdid_falsif}",
  "\\footnotesize",
  "\\begin{threeparttable}",
  "\\begin{tabular}{lccc}",
  "\\toprule",
  "\\textbf{Aggregation} & \\textbf{Estimate} & \\textbf{Std. error} & \\textbf{Two-sided p} \\\\",
  "\\midrule",
  sprintf("Simple average ATT & %s & %s & %s \\\\", fmt(csf_simple$overall.att),
          fmt(csf_simple$overall.se), fmt(p_null)),
  sprintf("Dynamic: average post-treatment & %s & %s & --- \\\\",
          fmt(csf_dynamic$overall.att), fmt(csf_dynamic$overall.se)),
  "\\bottomrule",
  "\\end{tabular}",
  "\\begin{tablenotes}\\footnotesize",
  "\\item Identical sample (g $\\neq$ 2002), identical 13 covariates, identical estimator settings to the homicide run; only the outcome changes.",
  "\\item The identifying assumption is that CAPS adoption is unrelated to trends in deaths of despair. A null here is evidence for the design; it does not by itself prove parallel trends.",
  "\\end{tablenotes}",
  "\\end{threeparttable}",
  "\\end{table}"
)
writeLines(tex, "output/tables/csdid_falsif_aggregates.tex")
cat("Wrote output/tables/csdid_falsif_aggregates.tex\n")

# =============================================================================
# STEP 8d — Rambachan-Roth sensitivity (HonestDiD, the real thing)
# =============================================================================
cat("\n=========== STEP 8d: HonestDiD sensitivity ===========\n")
cs <- readRDS(MAIN_RDS)

# aggte() on an object RELOADED from disk fails in did 2.1.1 (the S4 influence
# function loses its class: "object of type 'S4' is not subsettable"). So the
# dynamic aggregation must be done in the SAME session that fitted att_gt. 31_
# therefore exports the pieces HonestDiD needs; if it did not, we say so instead
# of guessing.
DYN_RDS <- "data/derived/csdid_main_dynamic.rds"
stopifnot("31_csdid_main.R must run in the same session that fitted att_gt; its dynamic export is missing" = file.exists(DYN_RDS))
dyn <- readRDS(DYN_RDS)
cat(sprintf("event-study export: %d event times, VCV present: %s\n",
            length(dyn$egt), if (is.null(dyn$V)) "NO" else "yes"))

if (is.null(dyn$V)) {
  cat("\n=====================================================================\n")
  cat("STEP 8d IS BLOCKED — recorded, not worked around.\n")
  cat("did", as.character(packageVersion("did")),
      "returns no variance-covariance matrix from aggte().\n")
  cat("HonestDiD needs the full VCV (sigma), not just the reported SEs, because the\n")
  cat("bounds are joint in the event-study coefficients.\n")
  cat("The influence function IS exposed (dynamic.inf.func.e), but its column norms\n")
  cat("do NOT reproduce the reported se.egt under any constant normalisation\n")
  cat("(relative spread ~21%), so an approximation from it would be invented, not\n")
  cat("estimated. No sensitivity numbers are produced.\n")
  cat("Consequence: this is the concrete cost of the Step 0 version gap.\n")
  cat("See audits/incidents/2026-10-09_brazil_caps_honestdid-blocked.md\n")
  cat("=====================================================================\n")
  writeLines(c(
    "SENSITIVITY (Step 8d) NOT PRODUCED — blocked by the estimator's version.",
    "",
    sprintf("did version installed : %s", as.character(packageVersion("did"))),
    "did version upstream  : 2.5.1 (CRAN DESCRIPTION, checked 2026-10-09)",
    "HonestDiD installed   : 0.2.0 (upstream 0.2.8)",
    "",
    "Reason: aggte() in did 2.1.1 returns overall.att, overall.se, egt, att.egt,",
    "se.egt, crit.val.egt and inf.function -- and no variance-covariance matrix.",
    "HonestDiD's createSensitivityResults() requires sigma, the full VCV of the",
    "event-study coefficients, because the Rambachan-Roth bounds are joint.",
    "",
    "Checked, not assumed: the exposed influence function dynamic.inf.func.e",
    "(5173 x 28) does not reproduce se.egt under a constant normalisation.",
    "se.egt / sqrt(colSums(IF^2)) ranges 0.000175 to 0.000216 across the 28 event",
    "times -- a ~21% relative spread -- so no single scalar recovers the VCV.",
    "",
    "Therefore no numbers are reported. Resolutions, in order of preference:",
    "  1. Upgrade did (>= 2.5.1) and re-run 31_ then 32_. CLAUDE.md requires asking",
    "     the researcher before installing or upgrading; that decision is open.",
    "  2. Bootstrap the event-study VCV by resampling municipalities and re-running",
    "     att_gt + aggte, then hand that sigma to HonestDiD. More compute, and the",
    "     bootstrap SEs should be checked against did's se.egt before use.",
    "",
    "This file is a statement of absence on purpose. A sensitivity table filled in",
    "from a hand-rolled 'se + M*se' would look like the method and not be it."
  ), "output/tables/brazil_caps_sensitivity_BLOCKED.txt")
  cat("\nWrote output/tables/brazil_caps_sensitivity_BLOCKED.txt\n")
  quit(save = "no", status = 0)
}

egt <- dyn$egt
V_used <- dyn$V
V_name <- if (is.null(attr(dyn$V, "source"))) "exported by 31_csdid_main.R" else attr(dyn$V, "source")
cat(sprintf("variance matrix used: %s (dim %d x %d)\n", V_name, nrow(V_used), ncol(V_used)))

# HonestDiD expects: pre-period coefficients, then post-period, with NO reference
# period. Under base_period = "universal" the -1 cell is pinned to 0 with zero
# variance, which makes sigma singular -- so it is dropped, and the count of pre
# and post periods is taken AFTER the drop.
keep <- which(egt != -1)
betahat <- dyn$att.egt[keep]
sigma   <- V_used[keep, keep]
numPre  <- sum(egt[keep] < 0)
numPost <- sum(egt[keep] >= 0)
cat(sprintf("event-study coefficients handed to HonestDiD: %d pre, %d post (reference period -1 dropped)\n",
            numPre, numPost))

# Target: the AVERAGE post-treatment effect, not the first post period.
l_vec <- rep(1 / numPost, numPost)
Mvec  <- seq(0, 2, by = 0.25)

run_honest <- function(method) {
  HonestDiD::createSensitivityResults(betahat = betahat, sigma = sigma,
                                      numPrePeriods = numPre, numPostPeriods = numPost,
                                      l_vec = l_vec, Mvec = Mvec, method = method)
}
res <- tryCatch(run_honest("FLCI"),
                error = function(e) { cat("method 'FLCI' failed:", conditionMessage(e), "\n"); NULL })
used_method <- "FLCI"
if (is.null(res)) {
  res <- tryCatch(run_honest(NULL),
                  error = function(e) { cat("default method failed:", conditionMessage(e), "\n"); NULL })
  used_method <- "package default"
}
stopifnot("HonestDiD could not produce sensitivity results" = !is.null(res))

sens <- as.data.table(res)
setnames(sens, c("M", "lb", "ub"), c("M", "ci_lower", "ci_upper"), skip_absent = TRUE)
print(sens)
cat(sprintf("\nmethod used: %s\n", used_method))

# breakdown M: smallest M whose interval contains zero
sens[, covers_zero := ci_lower <= 0 & ci_upper >= 0]
brk <- sens[covers_zero == TRUE]
breakdown <- if (nrow(brk)) min(brk$M) else NA_real_
cat(sprintf("breakdown M (interval first covers 0): %s\n",
            if (is.na(breakdown)) "none up to M = 2" else as.character(breakdown)))

orig <- HonestDiD::constructOriginalCS(betahat = betahat, sigma = sigma,
                                       numPrePeriods = numPre, numPostPeriods = numPost,
                                       l_vec = l_vec)
cat(sprintf("original (M = 0) interval: [%.4f, %.4f]\n", orig$lb, orig$ub))
cat(sprintf("simple ATT from 31_: %.4f\n", aggte(cs, type = "simple")$overall.att))

tex <- c(
  "\\begin{table}[htbp]\\centering",
  "\\caption{Rambachan-Roth sensitivity of the homicide effect to violations of parallel trends}",
  "\\label{tab:sensitivity}",
  "\\footnotesize",
  "\\begin{threeparttable}",
  "\\begin{tabular}{lcc}",
  "\\toprule",
  "\\textbf{$\\bar{M}$} & \\textbf{95\\% robust CI lower} & \\textbf{95\\% robust CI upper} \\\\",
  "\\midrule"
)
for (i in seq_len(nrow(sens)))
  tex <- c(tex, sprintf("%.2f & %.4f & %.4f \\\\", sens$M[i], sens$ci_lower[i], sens$ci_upper[i]))
tex <- c(tex,
  "\\bottomrule",
  "\\end{tabular}",
  "\\begin{tablenotes}\\footnotesize",
  sprintf("\\item HonestDiD %s, method = %s, %s variance matrix, target = average post-treatment effect.", as.character(packageVersion("HonestDiD")), used_method, V_name),
  "\\item $\\bar{M}$ bounds the permitted violation of parallel trends relative to the largest observed pre-treatment difference. $\\bar{M}=0$ is the point-identified case.",
  sprintf("\\item Breakdown: the interval first contains zero at $\\bar{M} = %s$.",
          if (is.na(breakdown)) "\\text{none up to 2}" else sprintf("%.2f", breakdown)),
  "\\end{tablenotes}",
  "\\end{threeparttable}",
  "\\end{table}"
)
writeLines(tex, "output/tables/brazil_caps_sensitivity.tex")
cat("Wrote output/tables/brazil_caps_sensitivity.tex\n")

# --- sensitivity figure -------------------------------------------------------
pS <- ggplot(sens, aes(M, (ci_lower + ci_upper) / 2)) +
  geom_hline(yintercept = 0, colour = bite_pal$muted, linetype = "22", linewidth = 0.5) +
  geom_errorbar(aes(ymin = ci_lower, ymax = ci_upper), width = 0.02,
                colour = bite_pal$teal, linewidth = 0.9) +
  geom_point(colour = bite_pal$teal, size = 2.2) +
  geom_point(data = sens[M == 0], shape = 23, fill = bite_pal$ink, colour = bite_pal$ink, size = 3.4) +
  scale_x_continuous(breaks = Mvec) +
  labs(
    title = "How much parallel-trends violation would overturn the homicide result",
    subtitle = "Rambachan-Roth robust 95% intervals for the average post-treatment effect",
    x = expression(bar(M) ~ " (permitted violation, relative to the largest pre-treatment difference)"),
    y = "Effect on homicides per 10,000 residents",
    caption = sprintf("Source: Dias & Fontes (2024) replication panel. HonestDiD %s, method %s, %s. Filled diamond is the point-identified estimate at M = 0.",
                      as.character(packageVersion("HonestDiD")), used_method, V_name)
  ) +
  theme_bite()
ggsave("output/figures/brazil_caps_sensitivity.png", pS, width = 9.6, height = 5.6, dpi = 300, bg = "white")
cat("Wrote output/figures/brazil_caps_sensitivity.png\n")
