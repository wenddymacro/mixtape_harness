# STATE: project working memory

**Last updated:** 2026-10-09 (evening)

## CURRENT OBJECTIVE

`analyses/brazil_caps` — a full end-to-end DiD run against the real Dias & Fontes (2024)
replication panel, to exercise the harness and the dashboard for real. **The run is
complete: 10 pipeline steps, all clean, 26 artifacts reproduced byte-identically.** It is
**not sign-off ready** — three gates are open (below), and they are the point.

## RECONCILIATION FIRST — STATE.md had drifted, and the reason is benign

Before this session, STATE.md described `analyses/brazil_caps/`, a bite figure, a sealed
`data/raw/brazil.dta` and `audits/` snapshots. **None of those existed on disk.** The four
`scripts/r/*.R` files did, so the description was not invented — the artifacts were.

Cause found, and it is not amnesia: `.gitignore` **deliberately** excludes `analyses/*`
(except `_template`), `/data/` and `/output/`. This checkout is the harness distribution;
per-analysis work was never committed to it. So the R scripts survived (scripts/ is not
ignored) and everything they produce did not.

**What was false and is now fixed:** the "CURRENT OBJECTIVE" block claiming a done bite
figure and canister files. **What was true and is now done:** the intake, which had never
happened on this machine. **Lesson for next time:** `analyses/*` being gitignored means
STATE.md can describe a state that structurally cannot survive a fresh clone. Worth either
committing one analysis as a worked example, or saying so in STATE.md.

## WHAT THIS RUN PRODUCED

**Data.** `data/raw/brazil.dta` — 39 MB, 82,140 × 117, 5,476 municipalities, 2002–2016.
Fetched from `scunning1975/mixtape` (the URL the Mixtape-Sessions/Causal-Inference-2 labs
use; the file is **not** in that repo). Sealed read-only (444/555) with a SHA-256 manifest.
`bash scripts/verify-raw.sh data/raw` → clean.

**Pipeline.** `code/run_pipeline.sh` written to the `/pipeline` skill's contract —
fingerprint, run, fingerprint, verdict. Last run: **159 s, 26 confirmed, 0 changed,
0 missing, 1 untouched** (the cached state geojson, correctly reported as not rewritten).

**The headline numbers, and the two that matter most:**

```
  anchor reproduced exactly   5,476 municipalities · 296 always-treated (excluded)
                              3,836 never-treated · 1,344 analysis-treated
  bite (Step 2)               psychiatric admissions  17.66 -> 10.47 per 10k  (-41%)
                              schizophrenia subset     7.97 ->  3.43 per 10k  (-57%)
  main ATT (Step 7)           simple  +0.2098 (SE 0.0654), 210/210 cells finite, 0 NA
                              dynamic +0.2746 (SE 0.1346)
  placebo (Step 8c)           deaths of despair  -0.0145 (SE 0.0355, p = 0.684)  <- null, good
```

## THE THREE OPEN GATES — these are the run's real output

1. **Sign of the ATT.** The estimate is **positive** — adoption associated with MORE
   homicides — the opposite of the published result. Unreconciled. Four candidate
   explanations listed in `stages/07_estimator_eventstudy/findings.md`. Do not quote this
   number as a replication.
2. **Version gap, with a measured cost.** installed `did` 2.1.1 vs upstream 2.5.1. This is
   not paperwork: `aggte()` returns **no variance-covariance matrix**, so **Step 8d
   (HonestDiD) could not run at all**. The influence function was tested as a substitute and
   does not reproduce the reported SEs (~21% spread), so no `sigma` was invented. Incident:
   `audits/incidents/2026-10-09_brazil_caps_honestdid-blocked.md`.
3. **EPV below floor.** 7 of 14 cohorts have < 7 treated units per covariate; smallest is
   the 2003 cohort at **3.62**. The estimator returned 210/210 finite cells anyway — "it
   ran" and "it is identified" are different claims. Remediation not yet recorded.

Secondary: `/covariates` was never run (list inherited from the course replication), and all
13 covariates fail the |0.25| balance threshold — consistent with adopters not being a
random draw.

## STAGE LOCKS — 5 closed, 4 held open, 1 active (2026-10-09)

Scott's correction, and it was right: completed stages were sitting red because **the lock
ritual was never performed**, not because the work was undone. The grid was mixing two
different things, so they were separated:

```
  GREEN  01_target  02_bite  04_sample_shares  05_outcome_trends  06_power
  AMBER  08_falsification   <- You Are Here
  RED    00_packages  03_covariates_balance  07_estimator_eventstudy  09_rerun  S_signoff
```

The five green ones were locked with a `LOCKED` file naming what each rests on. The four red
ones are red **for cause**, and are not to be swept green to make the row look better:

- **00_packages** — the Gawande pause is a *human* act. The AI read the versions; Scott has
  not looked and typed them, and both `behavior_note`s are still open. Locking this would
  green-light the exact thing Step 0 exists to prevent.
- **03_covariates_balance** — EPV below the floor in 7 of 14 cohorts, remediation unrecorded;
  `/covariates` never run.
- **07_estimator_eventstudy** — the 7b version gate failed, and the sign of the ATT is
  unreconciled against the paper.
- **09_rerun / S_signoff** — nothing to lock; sign-off is the last switch and the analysis is
  not sign-off ready.

One caveat travels with the 06_power lock and is written inside it: the MDE is real, but the
*economically meaningful* effect size is a data-grounded benchmark, not a researcher-chosen
policy target. Unlock that stage (`rm analyses/brazil_caps/stages/06_power/LOCKED`) to revisit.

## WHAT THE RUN FOUND WRONG (each fixed at the root, not worked around)

**In the harness itself — the two worth remembering:**

- **The official pipeline reported reproducible artifacts as CHANGED forever.** The
  `*_notes.txt` ledgers carried a `generated: <wall clock>` line and PDF writers embed a
  creation timestamp, so bytes always differed. Fixed: timestamps removed from the ledgers,
  PDFs excluded from the byte-verdict with the reason written into the runner.
  *A badge that is always red is a badge nobody reads.*
- **`no-offbook-exhibit` over-blocks.** `Rscript -e '<version probe>' && ... ls
  output/figures/` is refused, because the check regexes the whole command string: inline
  interpreter present AND an `output/` path present. No plot was being drawn. Written up in
  `dsh-guards/README.md`. Also found: the `SCRATCH_RUN=1` escape hatch is anchored to the
  **start** of the command, so `cd x && SCRATCH_RUN=1 ...` fails — the guard's own message
  recommends the form that does not work.

**In the dashboard — three fixes, all found by looking at it:**

- **The Tables tab was a static placeholder**; `render_tables()` existed but was never
  called, so the pipeline's verdicts were computed and thrown away. Wired it (this is the
  same fix the Figures tab got in a previous session).
- **The dashboard could not show pipeline progress at all — now it can.** Two causes, both
  fixed. (a) `render_sample_flow()` is dead code that was never called, and the "Official
  Pipeline" box lived inside it; the box was extracted into `render_pipeline_box()` and is
  now at the top of the Checklist and Tables views. (b) `code/run_pipeline.sh` writes no
  status a page could poll, and the report carried no `all_steps_ok` (so the box, wired
  as-was, would have falsely printed FAILED). The runner now maintains
  `audits/pipeline_runs/current.json` — rewritten before each step, carrying its own pid —
  and the report carries `all_steps_ok`, `steps_ran`, `steps_total`.
  New read-only `/api/pipeline`; the page polls it every 3 s and rewrites the box, so a run
  is visible **while it happens**: `RUNNING — step 9 of 10 (90%), 1m 15s elapsed` plus the
  current command. A run that ends triggers exactly one page reload, so the grid, verdict
  badges and figure list pick up the new state without the researcher remembering to
  refresh. A killed runner reads **`STOPPED EARLY`**, not "still running" — verified by
  planting a dead pid. All three states (running / finished / stale) were tested live.
- **The status was on the wrong page most of the time — Scott's correction, and it was
  right.** The dashboard is normally read inside DSH's **right-sidebar browser**
  (`@deepseek-ai/dsh-client-ui-sidebar-browser`), so a box living on the Checklist view is
  invisible whenever the reader is on Figures or Code. The carrier was investigated rather
  than guessed: Web uses an iframe with
  `sandbox="allow-scripts allow-forms **allow-same-origin** allow-popups
  allow-popups-to-escape-sandbox"`, Desktop uses `<webview>`, and **"the package does not
  proxy"** — so the page keeps its own origin, the relative `fetch('/api/pipeline')` is
  same-origin, and the dashboard sends no CSP and no `X-Frame-Options`, so it embeds. The gap
  was placement, not plumbing. Added a **sticky `.pipeline-strip`** at the top of `<main>`, on
  every view, driven by the same poll: `● RUNNING — step 8 of 10 (80%), 33s elapsed — Rscript
  scripts/r/30c_build_panel_falsif.R`, visible from any tab. Verified by screenshotting the
  Figures tab mid-run.
- `\textsuperscript{\dag}` rendered as the literal string "textsuperscriptdag" in any LaTeX
  table. The parser now maps LaTeX symbol commands to their characters.
- Two `SyntaxWarning`s print on every start (`invalid escape sequence '\('`). Fixed.
- `FIGURE_CAPTIONS.json` written for all **9** figures (the 10th, `brazil_caps_sensitivity.png`,
  is the one Step 8d's block prevented), so the red "?" no-description badges are gone.
  **Approval tiers left at "review" on purpose** — approving is the researcher's click,
  not mine.

## DASHBOARD: 中文/English, and getting it in front of the user (2026-10-09)

**Language toggle.** A button in the sidebar header swaps the UI between English and
Simplified Chinese. Rendered **server-side** from a `dsh-lang` cookie (`?lang=zh` also
works), not swapped in the DOM — a half-translated page is worse than an honest reload.
Translated: nav groups and tabs, view headings and intros, the pipeline box and status
strip, the checklist grid/legend/help, all 11 step names **and their plain-language
summaries**, and the package-card labels. **Deliberately NOT translated:** figure captions,
table content, findings, checklist bodies — pipeline output stays in the language its author
wrote it in. Translating a caption would create a second source of truth for a claim, which
is the one thing this harness must not do; the UI says so rather than leaving the reader to
wonder. (`I18N` + `I18N_LIVE` in `dashboard_server.py`; the live-status templates are
whole sentences per language, because gluing translated fragments together produces
nonsense when word order differs.)

**Opening it in the sidebar.** DSH's rule (from `dsh-client-ui-chat`'s README): with
**Settings → General → "Open chat links in" = In-App Sidebar** (the default), a chat
HTTP(S) link opens a new right-Sidebar Browser tab. So:
`code/open_dashboard.sh` starts the server if it is not already up, waits for a 200, and
prints the URL; the new **`/dashboard` skill** posts that URL as a bare link. One click,
and it opens beside the session. Both tested: the already-running path and the cold start.

**What could not be done, and why.** Opening the tab with **no click** needs a DSH *client*
plugin calling `ctx.sidebarRight.openTab('browser', {params:{url}})`. Client plugins are
compiled into the web bundle (`dsh.client` + a `./client` export; the shipped ones are
prebuilt JS inside `app.asar`), and this installation has no source tree and no `pnpm` — so
a new client plugin cannot be built into it from here. Recorded instead of faked. The
carrier itself was checked rather than assumed: Web uses an iframe with
`allow-same-origin`, Desktop a `<webview>`, and it does **not** proxy — so the dashboard's
same-origin `fetch('/api/pipeline')` works inside it, and the dashboard sends no CSP or
`X-Frame-Options`. Also noted: Browser is **disabled by default in Web profiles**, enabled
on Desktop; a Web profile needs `- id: ui-sidebar-browser` / `disabled: false`.

### ...and it now opens ITSELF — the client plugin exists (2026-10-09)

Scott supplied the DSH source (`github.com/deepseek-ai/deepseek-harness`), which removed the blocker.
Three facts were read out of the source rather than assumed, and they are what made this possible:

1. `dsh-client-modules` **scans the host Loader's entries** for packages declaring `dsh.client` and
   serves their client bundle under `/plugins`. So an **installed bundle** can contribute a client
   plugin — no DSH rebuild needed, which is why the earlier "cannot be built here" answer was wrong in
   its conclusion even though its reasoning about `app.asar` was right.
2. The served artifact must be a **built** `lib/client.js` — but "built" here means a very small,
   well-defined registration wrapper, not something only a bundler can emit. The shape was taken from a
   shipped bundle (`dsh-client-ui-brand-official/lib/client.js`), not guessed:
   `window.__ModuleLoader__.load({ id, factory })`.

   **That last step is where I got it wrong, and it cost a crash.** The *built* shipped bundles write
   `_ModuleLoader__` — one underscore — because the build wraps them. I copied the bare name by eye into a
   hand-written file, and the web boot died with `ReferenceError: _ModuleLoader__ is not defined` plus a
   modal the user could not dismiss. The authoritative shape is the repo's own authoring template
   (`packages/preset/agent-preset/skills/cordis-plugin-development/templates/decoration/client.js`):
   `window.__ModuleLoader__`, **two** underscores, factory **returns** `{ inject, apply }` instead of
   assigning to `exports`. Lesson worth keeping: a *built* artifact is ground truth for its own bytes, not
   for the source contract it was compiled from.
3. `exports["./client"]` is resolved as a string or one-level `{default}` (`packages/client/modules/src/index.ts`),
   and the tab body reads `tab.navigation.params?.url` (`view/BrowserBody.tsx`), which confirms
   `ctx.sidebarRight.openTab('browser', { params: { url } })` down to the key names.

**What was built.** The repo-root bundle gained a client face: `lib/client.js` (hand-written, in the
shape above), `dsh.client` = `{platform: "web", inject: ["@deepseek-ai/dsh-client-ui-sidebar-right"]}`,
and `exports["./client"]`. Package version 2.0.0 → 2.1.0. It polls the dashboard's new `/api/health`
(which carries an `instance` id that changes on every dashboard start) and opens the sidebar tab when it
sees an instance it has not opened before — so a **new activation opens a tab** but a **reload does not
open a second one**. `/api/health` and `/api/pipeline` now send `Access-Control-Allow-Origin: *`, because
the probe is cross-origin from the DSH page to localhost:8080.

**Verified:** `node test.mjs` → **82 passed, 0 failed** (11 new checks covering the client half), and
those checks were shown to **fail** on a deliberately broken `exports["./client"]` path — a check that
cannot fail proves nothing. `lib/client.js` parses under `node --check`. `/api/health` returns the
instance id with the CORS header, and the id was confirmed to change across a dashboard restart.

### It crashed the app once, and then it worked (2026-10-09, later)

**The crash.** The first version of `lib/client.js` used `_ModuleLoader__` (one underscore), copied by
eye from a *built* shipped bundle. A hand-written bundle cannot: the build wraps those. The web boot died
with `ReferenceError: _ModuleLoader__ is not defined` and a modal the user could not dismiss. The correct
contract is `window.__ModuleLoader__` with a factory that **returns** `{ inject, apply }`, per the repo's
own authoring template. `node test.mjs` now **evaluates** the file in a `node:vm` sandbox against a fake
registration sink and drives `apply` with a mock `ctx`, instead of regexing the text — a regex happily
agreed with the typo. Verified both ways: putting the typo back turns the suite red (4 failures), fixing
it turns it green.

**Then it worked — measured, not assumed.** `/api/health` now counts its own hits, and the plugin reports
back on success or failure:

```
  restart the dashboard; wait 12 s; exactly ONE curl from the agent:
      health_hits    15   ≈ one every 3 s — the plugin polling
      opened_reports  1   ctx.sidebarRight.openTab returned without throwing
      open_errors     0
  over the next 12 s:  hits 10 → 15, opened stayed at 1   <- no duplicate tab on reload
```

So the client half loads, activates, reaches the dashboard, and opens the tab exactly once per dashboard
activation. The one claim still resting on a human eye is that the tab is *visible*: `opened_reports`
proves the call returned, not that a tab rendered. Asked, not assumed.

**Two findings worth keeping.**

1. **Client bundles hot-reload.** The `?report=` fields showed up while the *old* client code was running,
   so DSH re-fetched the changed `lib/client.js` by itself — no restart, no `pnpm run dev:web`. The earlier
   "restart DSH after every client change" note was too cautious: a restart is needed for the **first**
   activation of a newly declared `dsh.client`, not for edits to one already active.
2. **The dashboard does not survive the app.** It was started with `nohup` and still died when DSH was
   restarted — the app's process group takes it down. So "the dashboard is up" cannot be assumed after a
   restart; `code/open_dashboard.sh` checks, which is why it exists.

`code/open_dashboard.sh` + the `/dashboard` skill remain the one-click path and the fallback if the
client half is not composed for any reason.

### Then the pane was the wrong shape for it (2026-10-09, later still)

Confirmed working in the real right-sidebar pane — and the first thing that pane revealed was that the
dashboard was not built for it. Three defects, all visible at ~730px wide:

1. **The landing view was an empty placeholder.** The auto-opened tab landed on **Decks**, which in a
   project with no HTML decks says "No HTML decks yet" forever. `_default_tab` is now
   `checklist_per_analysis` for non-git projects — the "where am I / what is the pipeline doing / which
   gates are open" screen, which is what an auto-opened tab should show.
2. **The landing view and the highlighted nav button were decided by two different rules.** The button
   followed `_default_tab`; the view hard-coded `active` onto Decks whenever the project had no `.git`.
   That is how the pane could highlight *Checklist* and render *Decks*. One rule now drives all three
   candidate landing views.
3. **No width breakpoint that helped the pane.** The fixed `200px` nav plus `2rem` of main padding left
   roughly 470px for content, so prose wrapped into tall columns and the status strip truncated
   mid-sentence. Added `@media (max-width: 900px)`: the nav becomes a horizontal wrapped strip, main
   padding drops to `0.9rem`, and the strip wraps instead of ellipsising. The Decks empty state was also
   cut from a paragraph to two lines — a wall of text is worse in a 500px column than anywhere else.

Verified by screenshot at the user's own width (732px) and again at 1680px to confirm the desktop layout
is unchanged: `audits/dashboard_2026-10-09/dash_narrow_sidebar.png`. `node test.mjs` → 89 passed.

## THE README IS NOW A BILINGUAL PAIR (2026-10-09)

`README.md` (English) + `README.zh.md` (中文), each opening with a switcher line, following the same
convention DSH's own repos use. Rewritten to cover what was missing: **installing from a git address**,
the worked example end to end with its numbers, and **the data** — where `brazil.dta` actually comes from,
its SHA-256, and the intake/seal workflow.

**What is documented as verified, and what is not.** The install dialog's Git form is quoted from DSH's
own constant (`INSTALL_GIT_EXAMPLE = 'https://github.com/author/dsh-plugin'` in
`packages/client/ui-plugin-manager/src/client/locales.ts`). Every install in this repo went through the
**local-path** route, so the README says plainly that the Git route has not been exercised here. The
guardrails bundle gets no URL at all: it lives in a subdirectory, the dialog takes a package spec, and no
subdirectory form was found in the source — local path or its own repo is the honest answer.

**The pair is checked, because two documents that should agree will drift.** `test.mjs` grew 12 checks:
a switcher link each way, the same count of `##` and `###` sections, the same number of fenced code
blocks, and five figures (`82,140`, `5,476`, `+0.2098`, `0.684`, `159`) that must appear on **both**
sides. Verified in both directions — deleting the Chinese back-link and changing one number to `9,999`
turned the suite red with exactly those two failures; restoring turned it green. **101 passed, 0 failed.**

DSH does the same thing more thoroughly with a per-section en/zh hash record (`README.i18n.yaml`,
`pnpm run verify-translation-pairing`); this is the dependency-free version of that idea.

**Outstanding for the GitHub push:** the READMEs use `<owner>/<repo>` placeholders in the Git-install
section — replace them with the real repository URL. This working copy is **not a git repository**, so
the push itself is the researcher's to do.

## NEXT

1. **Answer the version question** (gate 2): upgrade `did` to ≥ 2.5.1 and re-run `31_`/`32_`,
   or bootstrap the event-study VCV, or accept Step 8d blocked. Everything else is downstream
   of this.
2. **Reconcile the sign** (gate 1) against the paper's own specification.
3. **Record EPV remediation** (gate 3).
4. Then: `manifest.yaml` sign-off, a card per defended claim, and `/referee2` in a fresh session.

## CANONICAL FILES

- `CLAUDE.md` — harness law. `MANIFESTO.md` — design-without-peeking principle.
- `analyses/brazil_caps/checklist.md` — the walked instance: all 10 steps, every gate's status.
- `analyses/brazil_caps/ACTIVE_STAGE` = `08_falsification` (where the run stops).
- `analyses/brazil_caps/stages/*/findings.md` — the real per-stage record, numbers included.
- `code/run_pipeline.sh` — the official pipeline (`/pipeline` runs this). Maintains
  `audits/pipeline_runs/current.json` for the dashboard's live status.
- `data/raw/brazil.dta` + `data/raw.manifest.sha256` — sealed; `scripts/verify-raw.sh`.
- `audits/pipeline_runs/run_*.json` — dated verdict reports (the dashboard reads the newest);
  `current.json` is live state, not a report.
- `audits/incidents/2026-10-09_brazil_caps_honestdid-blocked.md` — the Step 8d incident.
- `audits/dashboard_2026-10-09/*.png` — screenshots of Checklist / Figures / Tables.
- `FIGURE_CAPTIONS.json` — figure descriptions (dashboard card backs).
- `dsh-guards/`, `index.js` + `cordis.patch.yml` + `package.json` — the two DSH bundles, both
  installed and verified live on 2026-10-09.

## OPEN QUESTIONS / BLOCKERS

- **Sign of the ATT** — opposite to the published result. Unreconciled.
- **did 2.1.1 < 2.5.1** — blocks Step 8d; awaiting Scott's call. Also: no upgrade attempted,
  and R here is 4.1.2 (2021), so "just upgrade" may not be simple.
- **EPV < 7 in 7 of 14 cohorts** — remediation not recorded.
- **`/covariates` not run** — list inherited; deviation recorded.
- **`scripts/r/_manifest.R` does not exist** — the checklist template's sign-off step
  references a helper this repo never shipped. `manifest.yaml` cannot be built as written.
- **Where should analysis work live?** CLAUDE.md says `analyses/<slug>/data/raw/brazil.dta`;
  every shipped script and the dashboard read top-level `data/raw/`. This run followed the
  scripts. The conflict is recorded, not resolved.
- **`analyses/*` is gitignored**, so a "worked example" analysis cannot be committed as-is.
  Decide: un-ignore one analysis, or accept that per-analysis state never travels.
