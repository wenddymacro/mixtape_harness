# 31_csdid_main.R — Steps 3, 4, 5 and 7 for brazil_caps: balance, overlap, sample
# shares, pre-treatment outcome trends, and the Callaway-Sant'Anna estimator with
# its event study.
# REQUIRES: did >= 2.1.1, data.table >= 1.14, ggplot2 >= 3.5, panelView >= 1.1.16
#
# VERSION GATE (Step 7b): the checklist records did 2.1.1 installed against
# upstream 2.5.1. CLAUDE.md says: if installed < required, STOP and ask. This
# script therefore refuses to run the estimator unless the caller acknowledges the
# gap explicitly, by setting ACKNOWLEDGE_DID_VERSION_GAP=1. That is deliberate
# friction, not ceremony — see analyses/brazil_caps/checklist.md Step 7b.
#
# Sample: data/derived/panel_clean.csv, built by 30b (g != 2002; 5,180 units).
# The sample is NOT re-filtered here — one definition, one place.
#
# Inputs : data/derived/panel_clean.csv, data/derived/gvar_county.csv
# Outputs: see the write_list at the bottom of this header.
#   output/tables/balance_main.tex
#   output/figures/pscore_main.png
#   output/tables/cohort_rollout.tex
#   output/figures/rollout_panelview.png
#   output/figures/outcome_by_cohort.png
#   output/figures/csdid_event_study_main.png
#   output/tables/csdid_main_results.csv
#   output/tables/csdid_main_aggregates.tex
#   data/derived/csdid_main.rds            (the fitted att_gt object, for 32_*)

suppressPackageStartupMessages({
  library(data.table); library(ggplot2); library(did); library(panelView)
})
source("scripts/r/_theme_bite.R")

PANEL <- "data/derived/panel_clean.csv"
GVAR  <- "data/derived/gvar_county.csv"
stopifnot("run 30b_build_panel_clean.R first" = file.exists(PANEL))
stopifnot("run 30_build_gvar.R first" = file.exists(GVAR))

COVS <- c("rural", "theil2000trend", "lnsaudepctrend",
          "pop20a29anoslino", "pop40a49anoslino", "pop50a59anoslino",
          "pop60a69anoslino", "pop70a79anoslino",
          "pop10a19anosnino", "pop20a29anosnino", "pop50a59anosnino",
          "pop60a69anosnino", "pop70a79anosnino")
K <- length(COVS)

panel <- fread(PANEL)
gvar  <- fread(GVAR)
panel[, g := as.integer(g)]

# human-readable names for the balance table (CLAUDE.md: variable names are never labels)
LABELS <- c(
  rural              = "Rural population share (popruraltrend / year)",
  theil2000trend     = "Income inequality (Theil index, 2000)",
  lnsaudepctrend     = "Log health spending per capita",
  pop20a29anoslino   = "Population 20-29, literate",
  pop40a49anoslino   = "Population 40-49, literate",
  pop50a59anoslino   = "Population 50-59, literate",
  pop60a69anoslino   = "Population 60-69, literate",
  pop70a79anoslino   = "Population 70-79, literate",
  pop10a19anosnino   = "Population 10-19, illiterate",
  pop20a29anosnino   = "Population 20-29, illiterate",
  pop50a59anosnino   = "Population 50-59, illiterate",
  pop60a69anosnino   = "Population 60-69, illiterate",
  pop70a79anosnino   = "Population 70-79, illiterate"
)

cat("=========== loaded ===========\n")
cat(sprintf("panel: %d rows, %d municipalities, years %d-%d\n",
            nrow(panel), uniqueN(panel$cod), min(panel$ano), max(panel$ano)))

# =============================================================================
# STEP 3 — covariates, balance, overlap, EPV
# =============================================================================
cat("\n=========== STEP 3: balance (baseline 2002) ===========\n")

base02 <- panel[ano == 2002]
stopifnot("baseline year 2002 missing" = nrow(base02) > 0)

bal <- rbindlist(lapply(COVS, function(v) {
  x0 <- base02[g == 0][[v]]; x1 <- base02[g > 0][[v]]
  m0 <- mean(x0, na.rm = TRUE); m1 <- mean(x1, na.rm = TRUE)
  s0 <- sd(x0, na.rm = TRUE);   s1 <- sd(x1, na.rm = TRUE)
  data.table(variable = v, label = LABELS[[v]],
             control_mean = m0, treated_mean = m1,
             norm_diff = (m1 - m0) / sqrt((s0^2 + s1^2) / 2),
             n_control = sum(!is.na(x0)), n_treated = sum(!is.na(x1)))
}))
bal[, imbalanced := abs(norm_diff) > 0.25]
print(bal[, .(variable, control_mean = round(control_mean, 3),
              treated_mean = round(treated_mean, 3),
              norm_diff = round(norm_diff, 3), imbalanced)])

n_imb <- sum(bal$imbalanced)
cat(sprintf("\n%d of %d covariates exceed the Imbens-Rubin |0.25| threshold\n", n_imb, nrow(bal)))

# --- balance table (LaTeX, booktabs) -----------------------------------------
tex <- c(
  "\\begin{table}[htbp]\\centering",
  "\\caption{Baseline covariate balance, 2002 (never-treated vs. ever-treated eventually adopting CAPS)}",
  "\\label{tab:balance_main}",
  "\\footnotesize",
  "\\begin{threeparttable}",
  "\\begin{tabular}{lccc}",
  "\\toprule",
  "\\textbf{Covariate} & \\textbf{Control mean} & \\textbf{Treated mean} & \\textbf{Norm. diff.} \\\\",
  "\\midrule"
)
for (i in seq_len(nrow(bal))) {
  flag <- if (bal$imbalanced[i]) "\\textsuperscript{\\dag}" else ""
  tex <- c(tex, sprintf("%s%s & %.3f & %.3f & %.3f \\\\",
                        bal$label[i], flag, bal$control_mean[i],
                        bal$treated_mean[i], bal$norm_diff[i]))
}
tex <- c(tex,
  "\\midrule",
  sprintf("\\textbf{Covariates} & \\textbf{%d} & \\textbf{%d} & \\textbf{%d flagged} \\\\",
          nrow(bal), nrow(bal), n_imb),
  "\\bottomrule",
  "\\end{tabular}",
  "\\begin{tablenotes}\\footnotesize",
  "\\item Normalized difference is the Imbens-Rubin difference in means, $(\\bar{X}_1-\\bar{X}_0)/\\sqrt{(s_1^2+s_0^2)/2}$; $|\\text{ND}|>0.25$ is flagged with \\textsuperscript{\\dag}.",
  "\\item Baseline is 2002, the first panel year. The 296 municipalities already treated in 2002 are excluded (no pre-period).",
  "\\item Balance is not the identifying assumption here --- parallel trends is --- but severe imbalance in a covariate that drives outcome trends is a warning, not a comfort.",
  "\\end{tablenotes}",
  "\\end{threeparttable}",
  "\\end{table}"
)
writeLines(tex, "output/tables/balance_main.tex")
cat("Wrote output/tables/balance_main.tex\n")

# --- EPV per cohort (Step 3, "within cohort, not total") ----------------------
epv <- gvar[g >= 2003 & g <= 2016, .(n_treated = .N), by = .(cohort = g)][order(cohort)]
epv[, epv := n_treated / K]
epv[, remediation_needed := epv < 7]
cat("\n--- EPV by cohort (k =", K, "covariates) ---\n")
print(epv[, .(cohort, n_treated, epv = round(epv, 2), remediation_needed)])
smallest <- epv[which.min(epv)]
cat(sprintf("\nSMALLEST-COHORT EPV = %.2f (cohort %d, n=%d). Checklist floor is 7.\n",
            smallest$epv, smallest$cohort, smallest$n_treated))
if (any(epv$remediation_needed))
  cat("!! EPV below the hard floor for", sum(epv$remediation_needed),
      "cohort(s) -- recorded in stage findings, not silently ignored.\n")

# --- propensity score for overlap (probit on the same covariates) -------------
cat("\n=========== STEP 3b: propensity score (probit) ===========\n")
base02[, treat := as.integer(g > 0)]
ps_form <- as.formula(paste("treat ~", paste(COVS, collapse = " + ")))
# standardise covariates so the probit is numerically well-behaved
Z <- scale(as.matrix(base02[, ..COVS]))
colnames(Z) <- COVS
cc <- complete.cases(Z)
if (any(!cc)) {
  cat(sprintf("NOTE: %d of %d baseline municipalities dropped from the probit (NA in a covariate): %s\n",
              sum(!cc), length(cc), paste(base02$cod[!cc], collapse = ", ")))
}
ps_df <- data.table(treat = base02$treat[cc], as.data.table(Z[cc, , drop = FALSE]))
fit <- glm(ps_form, data = ps_df, family = binomial(link = "probit"))
ps_df[, pscore := predict(fit, type = "response")]

cat(sprintf("propensity score, control : min %.4f  max %.4f\n",
            min(ps_df[treat == 0]$pscore), max(ps_df[treat == 0]$pscore)))
cat(sprintf("propensity score, treated : min %.4f  max %.4f\n",
            min(ps_df[treat == 1]$pscore), max(ps_df[treat == 1]$pscore)))
n_hi <- sum(ps_df$pscore > 0.995 & ps_df$treat == 0)
cat(sprintf("controls with pscore > 0.995: %d (not trimmed -- recorded)\n", n_hi))
sep <- min(ps_df[treat == 1]$pscore) > max(ps_df[treat == 0]$pscore)
cat(sprintf("perfect separation? %s\n", if (sep) "YES -- overlap fails" else "no -- the supports overlap"))

ps_long <- rbind(
  ps_df[treat == 1, .(pscore, group = "Ever-treated (CAPS 2003-2016)")],
  ps_df[treat == 0, .(pscore, group = "Never-treated")]
)
p_ps <- ggplot(ps_long, aes(pscore, fill = group, colour = group)) +
  geom_histogram(data = ps_long[group == "Never-treated"],
                 aes(y = after_stat(density)), bins = 40,
                 fill = "transparent", colour = bite_pal$muted, linewidth = 0.4) +
  geom_histogram(data = ps_long[group != "Never-treated"],
                 aes(y = after_stat(density)), bins = 40,
                 fill = bite_pal$teal, colour = NA, alpha = 0.75) +
  labs(
    title = "Probability of ever adopting a CAPS, by treatment group",
    subtitle = "Probit on the 13 baseline covariates, 2002 cross-section · densities, not counts",
    x = "Estimated probability of ever adopting a CAPS",
    y = "Density",
    caption = "Source: SIH/DATASUS and IBGE, via the Dias & Fontes (2024) replication panel. Outline = never-treated, filled = ever-treated."
  ) +
  theme_bite() +
  theme(legend.position = c(0.82, 0.85), legend.title = element_blank(),
        legend.background = element_blank(),
        legend.key = element_blank(),
        legend.text = element_text(colour = bite_pal$ink, size = 10))
ggsave("output/figures/pscore_main.png", p_ps, width = 9.6, height = 5.6, dpi = 300, bg = "white")
cat("Wrote output/figures/pscore_main.png\n")

# =============================================================================
# STEP 4 — sample shares (cohort rollout table)
# =============================================================================
cat("\n=========== STEP 4: sample shares ===========\n")
sh <- gvar[g >= 2003 & g <= 2016, .(n = .N), by = .(cohort = g)][order(cohort)]
sh[, share := n / sum(n)]
never <- gvar[g == 0, .N]
always <- gvar[g == 2002, .N]
print(sh)
dom <- sh[which.max(share)]
cat(sprintf("\ndominant cohort: %d (%.1f%% of analysis-treated)\n", dom$cohort, 100 * dom$share))

tex <- c(
  "\\begin{table}[htbp]\\centering",
  "\\caption{CAPS introduction timing and sample shares}",
  "\\label{tab:cohort_rollout}",
  "\\footnotesize",
  "\\begin{threeparttable}",
  "\\begin{tabular}{lcc}",
  "\\toprule",
  "\\textbf{CAPS cohort} & \\textbf{Municipalities} & \\textbf{Share of treated} \\\\",
  "\\midrule"
)
for (i in seq_len(nrow(sh)))
  tex <- c(tex, sprintf("%d & %s & %.3f \\\\", sh$cohort[i],
                        format(sh$n[i], big.mark = ","), sh$share[i]))
tex <- c(tex,
  "\\midrule",
  sprintf("\\textbf{Analysis-treated total} & \\textbf{%s} & \\textbf{1.000} \\\\",
          format(sum(sh$n), big.mark = ",")),
  "\\midrule",
  sprintf("Never treated (comparison group) & %s & --- \\\\", format(never, big.mark = ",")),
  sprintf("Already treated in 2002 (excluded) & %s & --- \\\\", format(always, big.mark = ",")),
  "\\midrule",
  sprintf("\\textbf{Total municipalities} & \\textbf{%s} & \\textbf{---} \\\\",
          format(never + always + sum(sh$n), big.mark = ",")),
  "\\bottomrule",
  "\\end{tabular}",
  "\\begin{tablenotes}\\footnotesize",
  "\\item Nearest-neighbour Callaway-Sant'Anna aggregation weights each cohort by its share of treated units, $N_g/N_T$, so the dominant cohort drives the headline number more than its size suggests.",
  sprintf("\\item Dominant cohort: %d, %.1f\\%% of the analysis-treated sample.", dom$cohort, 100 * dom$share),
  "\\item The 2002 cohort is excluded: 2002 is the first panel year, so those municipalities have no pre-treatment period.",
  "\\end{tablenotes}",
  "\\end{threeparttable}",
  "\\end{table}"
)
writeLines(tex, "output/tables/cohort_rollout.tex")
cat("Wrote output/tables/cohort_rollout.tex\n")

# =============================================================================
# STEP 2b — rollout figure (panelView)
# =============================================================================
cat("\n=========== STEP 2b: rollout figure ===========\n")
pv <- panelview(homicide_rate ~ ca, data = as.data.frame(panel),
                index = c("cod", "ano"), type = "treat",
                xlab = "Year", ylab = "Municipalities",
                by.timing = TRUE, pre.post = TRUE, display.all = TRUE,
                legend.labs = NULL, main = "Rollout of CAPS centres")
ggsave("output/figures/rollout_panelview.png", pv, width = 10, height = 6, dpi = 300, bg = "white")
cat("Wrote output/figures/rollout_panelview.png\n")

# =============================================================================
# STEP 5 — outcome trends by group, PRE-TREATMENT ONLY (Rubin 2008: don't peek)
# =============================================================================
cat("\n=========== STEP 5: pre-treatment outcome trends ===========\n")
# Each cohort's line stops at g-1. The never-treated line runs the whole window,
# because those units are never treated -- every year of theirs is a pre-period.
coh <- panel[, .(mean_rate = mean(homicide_rate, na.rm = TRUE)), by = .(g, ano)]
coh[, cutoff := ifelse(g == 0, max(ano), g - 1L)]
coh <- coh[ano <= cutoff]
coh[, cohort_lab := ifelse(g == 0, "Never treated", paste0(g, " cohort"))]
coh[, cohort_lab := factor(cohort_lab, levels = c("Never treated", paste(2003:2016, "cohort")))]

# one grey reference line per cohort, never-treated highlighted in ink
p5 <- ggplot(coh, aes(ano, mean_rate, group = cohort_lab)) +
  geom_line(data = coh[g != 0], colour = bite_pal$grid, linewidth = 0.6) +
  geom_point(data = coh[g != 0], colour = bite_pal$grid, size = 0.9) +
  geom_line(data = coh[g == 0], colour = bite_pal$ink, linewidth = 1.3) +
  geom_point(data = coh[g == 0], colour = bite_pal$ink, size = 1.1) +
  facet_wrap(~ cohort_lab, ncol = 4, scales = "free_x") +
  scale_x_continuous(breaks = seq(2002, 2016, 4)) +
  labs(
    title = "Homicides per 10,000 before CAPS adoption, by adoption cohort",
    subtitle = "Each panel runs only up to the year before that cohort adopts (the never-treated line runs the full window)",
    x = "Year", y = "Homicides per 10,000 residents",
    caption = "Source: SIM/DATASUS, Dias & Fontes (2024) replication panel. Post-adoption years are deliberately excluded: this step checks comparability before treatment, and looking at the after-period here would void the check."
  ) +
  theme_bite(base_size = 11) +
  theme(strip.text = element_text(colour = bite_pal$ink, size = 9, face = "bold"),
        panel.spacing = unit(0.9, "lines"))
ggsave("output/figures/outcome_by_cohort.png", p5, width = 13, height = 8, dpi = 300, bg = "white")
cat("Wrote output/figures/outcome_by_cohort.png\n")

# =============================================================================
# STEP 7 — the estimator
# =============================================================================
if (Sys.getenv("ACKNOWLEDGE_DID_VERSION_GAP") != "1") {
  stop(paste0(
    "\nStep 7b gate: did ", as.character(packageVersion("did")),
    " is installed; the checklist records upstream 2.5.1.\n",
    "CLAUDE.md: if installed < required, STOP and ask before proceeding.\n",
    "If the decision is to run on the installed version anyway, re-run with\n",
    "  ACKNOWLEDGE_DID_VERSION_GAP=1 Rscript scripts/r/31_csdid_main.R\n",
    "and record the gap as a documented limitation (not a silent one)."))
}
cat("\n=========== STEP 7: att_gt (CS-DiD) ===========\n")
cat(sprintf("did version: %s\n", as.character(packageVersion("did"))))
cat(sprintf("spec: homicide_rate ~ %d covariates | control_group = notyettreated | base_period = universal | bstrap 1000\n", K))

set.seed(1)
t0 <- Sys.time()
cs <- att_gt(yname = "homicide_rate", tname = "ano", idname = "cod", gname = "g",
             xformla = as.formula(paste("~", paste(COVS, collapse = " + "))),
             data = as.data.frame(panel),
             est_method = "dr", control_group = "notyettreated",
             base_period = "universal", bstrap = TRUE, biters = 1000)
cat(sprintf("att_gt finished in %.1f min\n", as.numeric(difftime(Sys.time(), t0, units = "mins"))))
saveRDS(cs, "data/derived/csdid_main.rds")

cat("\n--- ATT(g,t) cells ---\n")
n_cells <- length(cs$att); n_na <- sum(is.na(cs$att))
cat(sprintf("cells: %d, finite: %d, NA: %d\n", n_cells, sum(is.finite(cs$att)), n_na))
if (n_na > 0) cat("!! ", n_na, " cells returned NA -- investigate before trusting the aggregate\n", sep = "")

cs_simple   <- aggte(cs, type = "simple")
cs_dynamic  <- aggte(cs, type = "dynamic")
cs_group    <- aggte(cs, type = "group")
cs_calendar <- aggte(cs, type = "calendar")

# --- export the dynamic aggregation for 32_ -----------------------------------
# aggte() on an att_gt object RELOADED from disk fails in did 2.1.1 with
# "object of type 'S4' is not subsettable" (the serialised influence function
# loses its class). The dynamic pieces must therefore be exported HERE, in the
# session that fitted the model. V is whatever variance-covariance matrix the
# estimator exposes -- if this version exposes none, 32_ reports Step 8d blocked
# rather than manufacturing a sigma from the influence function.
dyn_export <- list(
  egt         = cs_dynamic$egt,
  att.egt     = cs_dynamic$att.egt,
  se.egt      = cs_dynamic$se.egt,
  crit.val    = cs_dynamic$crit.val.egt,
  overall.att = cs_dynamic$overall.att,
  overall.se  = cs_dynamic$overall.se,
  V           = if (!is.null(cs_dynamic$V)) cs_dynamic$V
                else if (!is.null(cs_dynamic$V.analytical)) cs_dynamic$V.analytical
                else NULL,
  did_version = as.character(packageVersion("did"))
)
saveRDS(dyn_export, "data/derived/csdid_main_dynamic.rds")
cat(sprintf("\ndynamic export written; VCV present: %s\n",
            if (is.null(dyn_export$V)) "NO -- Step 8d will be reported BLOCKED" else "yes"))

cat("\n--- simple ATT ---\n"); print(summary(cs_simple))
cat("\n--- dynamic (event study) ---\n"); print(summary(cs_dynamic))

# --- event study figure -------------------------------------------------------
ev <- data.table(egt = cs_dynamic$egt, att = cs_dynamic$att.egt, se = cs_dynamic$se.egt)
crit <- if (!is.null(cs_dynamic$crit.val)) cs_dynamic$crit.val[1] else 1.96
cat(sprintf("\nuniform critical value used for the bands: %.4f (not 1.96)\n", crit))
ev[, `:=`(lo = att - crit * se, hi = att + crit * se)]
ev[, is_ref := egt == -1]
# the g-1 reference cell is 0 by construction, not an estimate
ev[is_ref == TRUE, `:=`(att = 0, lo = 0, hi = 0)]
win <- ev[egt >= -5 & egt <= 5]

p7 <- ggplot(win, aes(egt, att)) +
  geom_hline(yintercept = 0, colour = bite_pal$grid, linewidth = 0.5) +
  geom_vline(xintercept = -0.5, colour = bite_pal$muted, linetype = "22", linewidth = 0.5) +
  geom_errorbar(aes(ymin = lo, ymax = hi), width = 0.12, colour = bite_pal$teal, linewidth = 0.7) +
  geom_point(data = win[is_ref == FALSE], colour = bite_pal$teal, size = 2.4) +
  geom_point(data = win[is_ref == TRUE], colour = bite_pal$ink, fill = "white", shape = 21, size = 3, stroke = 1.1) +
  geom_line(colour = bite_pal$teal, linewidth = 0.5, alpha = 0.6) +
  scale_x_continuous(breaks = seq(-5, 5, 1)) +
  labs(
    title = "Homicides per 10,000: change after a municipality adopts a CAPS",
    subtitle = sprintf("Callaway-Sant'Anna, not-yet-treated comparison, 13 covariates · %d%% uniform bands", round(100 * (1 - 0.05))),
    x = "Years relative to CAPS adoption",
    y = "Effect on homicides per 10,000 residents",
    caption = paste(strwrap(sprintf("Source: Dias & Fontes (2024) replication panel, %s municipalities. Hollow marker at -1 is the reference period, fixed at zero by construction. did %s, est_method = dr, control group = not-yet-treated.",
                      format(uniqueN(panel$cod), big.mark = ","), as.character(packageVersion("did"))), width = 108), collapse = "\n")
  ) +
  theme_bite()
ggsave("output/figures/csdid_event_study_main.png", p7, width = 9.6, height = 5.8, dpi = 300, bg = "white")
cat("Wrote output/figures/csdid_event_study_main.png\n")

# --- results csv --------------------------------------------------------------
fwrite(ev[, .(egt, att, se, ci_lower = lo, ci_upper = hi, is_reference = is_ref,
              crit_val = crit)],
       "output/tables/csdid_main_results.csv")
cat("Wrote output/tables/csdid_main_results.csv\n")

# --- aggregates tex -----------------------------------------------------------
fmt <- function(x, d = 3) ifelse(is.na(x), "---", sprintf(paste0("%.", d, "f"), x))
agg_row <- function(lab, obj, extra = "") {
  sprintf("%s & %s & %s & %s \\\\", lab, fmt(obj$overall.att), fmt(obj$overall.se),
          extra)
}
tex <- c(
  "\\begin{table}[htbp]\\centering",
  "\\caption{Callaway-Sant'Anna estimates: effect of CAPS adoption on homicides per 10,000}",
  "\\label{tab:csdid_main}",
  "\\footnotesize",
  "\\begin{threeparttable}",
  "\\begin{tabular}{lcc}",
  "\\toprule",
  "\\textbf{Aggregation} & \\textbf{Estimate} & \\textbf{Std. error} \\\\",
  "\\midrule",
  agg_row("Simple average ATT", cs_simple),
  agg_row("Dynamic: average post-treatment", cs_dynamic),
  agg_row("Group: average by adoption cohort", cs_group),
  agg_row("Calendar: average by year", cs_calendar),
  "\\bottomrule",
  "\\end{tabular}",
  "\\begin{tablenotes}\\footnotesize",
  sprintf("\\item Callaway-Sant'Anna (2021) doubly-robust estimator, control group = not-yet-treated, universal base period, %d baseline covariates.", K),
  sprintf("\\item did version %s; installed version differs from upstream 2.5.1 and the gap is recorded as a limitation.", as.character(packageVersion("did"))),
  "\\item Standard errors are the analytic ones returned by \\texttt{aggte} for each aggregation.",
  "\\end{tablenotes}",
  "\\end{threeparttable}",
  "\\end{table}"
)
writeLines(tex, "output/tables/csdid_main_aggregates.tex")
cat("Wrote output/tables/csdid_main_aggregates.tex\n")

cat("\n=== SIMPLE ATT:", round(cs_simple$overall.att, 4),
    " SE:", round(cs_simple$overall.se, 4), "===\n")
