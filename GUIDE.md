# Using the harness — a step-by-step guide

English | [中文](GUIDE.zh.md)

This is the *do this, then that* guide. [`README.md`](README.md) explains what the repo **is**; this file
explains what **you** do with it, in order, from installing it to signing an analysis off.

Two audiences, same steps: if you work in DSH, start at step 1. If you only want the repo's rules,
scripts and dashboard without DSH, skip to step 2 — everything except the skill catalog works standalone.

---

## 0. Before you start

**You need:** `python3` (the dashboard uses only the standard library), and `R` plus the estimation
packages if you are running the example pipeline. Node is optional and only for the repo's own tests.

**One habit decides whether this works:** raw data is write-once. You never edit `data/raw/`. Everything
downstream is code that reads it and writes somewhere else. The harness enforces this twice — a guardrail
refuses an agent write, and the filesystem permissions make the refusal physical — but the habit is what
makes the enforcement invisible instead of annoying.

---

## 1. Install it (once, in DSH)

1. Sidebar → **Plugins** → **Add plugin**.
2. Paste one address, press **Install**, then **Enable now**:

   | Bundle | Address |
   |---|---|
   | Skills + dashboard | `https://github.com/wenddymacro/mixtape_harness` |
   | Guardrails | `https://github.com/wenddymacro/mixtape_harness.git#path:/dsh-guards` |

3. Read the returned `application` field. **`applied`** is what means the change is live — not the server
   logs, and not "the install finished".
4. Start a **new session**. The skill catalog should now list `amnesia`, `dashboard`, `pipeline`,
   `referee2`, `blindspot`, `drift-sweep`, `bibcheck` and the rest.
5. If the dashboard should open by itself, confirm the Browser tab type is enabled — **Settings** has no
   switch for it; the profile patch does: `- id: ui-sidebar-browser` / `disabled: false`. It is on by
   default on Desktop and off in Web profiles.

**Prove it works, rather than assuming:**

```
  bash code/open_dashboard.sh          # prints http://localhost:8080/
  curl -s http://localhost:8080/api/health
      → {"ok":true,"instance":"...","health_hits":N,...}
```

`health_hits` climbing while nobody is curling means the client half is polling — which is the only
external evidence that the auto-open plugin is alive.

**After any change to `lib/client.js`:** client bundles hot-reload, so edits take effect without a
restart. A restart is needed only the *first* time a newly declared `dsh.client` activates.

---

## 2. Your first five minutes

1. **Skim [`CLAUDE.md`](CLAUDE.md).** You do not have to read all of it. Read these four things and you
   have 80% of it: zero-error is a *constraint* rather than a goal; a checkbox is a *verification*, not an
   intention; the stage colour *is* the lock state; disk — not anyone's memory — is the record. The rest
   is reference you will pull when you need it.
2. **Open the dashboard:** `bash code/open_dashboard.sh`. It starts the server if it is not running and
   prints the URL. Read it in DSH's right-sidebar browser; that is what it is built for.
3. **Look at three things and nothing else:**
   - the **grid** — green means a stage is locked (signed off), amber is the one room you are in, red is
     open. If a stage looks green and its work is not signed off, that is a bug, not a rounding.
   - the **status strip** at the top — what the pipeline is doing right now.
   - the **verdict badges** on Tables — whether the last pipeline run reproduced each artifact.
4. **Switch language** with the `中文` / `EN` button in the sidebar header. It persists. Chrome is
   translated; captions, tables and findings deliberately are not.

---

## 3. Start a project

1. **Name the analysis.** A short kebab-case nickname — the **slug** — that will be its folder name:
   `brazil_caps`, `minwage-2013`, whatever distinguishes *this* target population, treatment definition
   and time window. One slug per distinct design.
2. **Scaffold it.** In a DSH session, invoke `/newproject`. Without DSH, copy `analyses/_template/` to
   `analyses/<slug>/`.
3. **Instantiate the checklist.** Copy `checklists/did_checklist.md` to `analyses/<slug>/checklist.md`
   and fill in the frontmatter: slug, start date, estimator, target population, treatment definition, time
   window. `analyses/_template/checklist.md` is the same skeleton already in place.
4. **Create the stage canisters** — one folder per checklist step:

   ```
     analyses/<slug>/stages/00_packages … 09_rerun, S_signoff
   ```

   Nothing else about the project is scaffolded for you; that is the whole structure.

---

## 4. Get real data in — and seal it

1. **Intake through the one sanctioned door.** It unseals, copies, re-seals and refreshes the fingerprint:

   ```
     RAW_DIR=data/raw bash scripts/intake-raw.sh /path/to/your.dta
   ```

   It refuses to overwrite an existing raw file. `--replace` supersedes one on purpose; `--hard` hands
   ownership to `root` so even you need `sudo` to change it.
2. **Verify it.** This is the check you run again later, whenever you doubt anything:

   ```
     bash scripts/verify-raw.sh data/raw
   ```

3. **Write the ledger as you build each panel.** Every derived dataset records rows in, rows out, and why
   any were dropped. A sample that shrinks with no stated reason is itself an error — the ledger is how you
   notice.
4. **Note where the data came from, and that you checked it.** Record the source URL and the SHA-256 in
   the stage's `findings.md`, the way `analyses/brazil_caps/` does. Six months from now that line is the
   only thing that can prove which bytes you analysed.

---

## 5. Walk the checklist, one room at a time

1. **Enter a room** by writing its folder name into `analyses/<slug>/ACTIVE_STAGE`. Everything you do is
   scoped to that room; the grid turns it amber.
2. **Work inside the canister.** Each stage folder holds four files:
   `ideas.md` (scratch for this stage only), `todo.md` (its action list), `findings.md` (the write-up
   gate), `exhibits.md` (the readable shelf of what it produced).
3. **Write `findings.md` before you leave.** This is the write-up gate: you do not advance until the
   lesson is recorded. Write it while it is fresh — that is the whole point.
4. **Lock the room you are leaving.** A file literally named `LOCKED` in the stage folder turns it green.
   Then point `ACTIVE_STAGE` at the next room. Exactly one amber, ever.
5. **Steps 0–9, in order.** Step 7 — the estimator — is gated by Step 0 *and* Steps 1–6. What each step
   wants, in one line each:

   | | Step | The deliverable that closes it |
   |---|---|---|
   | 0 | Package preflight | **you** ran `packageVersion()` and typed the numbers in |
   | 1 | Target estimand | the estimand, the population, the weighting, and why |
   | 2 | Bite | maps and a time series showing the treatment landed |
   | 3 | Covariates & balance | balance table, overlap figure, events-per-variable per cohort |
   | 4 | Sample shares | treated counts by cohort and each cohort's share |
   | 5 | Outcome trends | pre-treatment only — do not peek |
   | 6 | Power | the minimum detectable effect, before you estimate |
   | 7 | Estimator + event study | the event study and the ATT table |
   | 8 | Falsification & sensitivity | a placebo that ran, and sensitivity bounds |
   | 9 | Rerun | only if the estimator misbehaved |

---

## 6. Build the pipeline

1. **One script per deliverable.** A figure or table that no named script produces cannot be re-run,
   re-styled or audited, so it is not allowed to exist. The guardrails block an inline plot for exactly
   this reason.
2. **Declare the interface at the top of every script** — `# REQUIRES: pkg >= version` — so the version
   question is answerable later without guessing.
3. **Write the runner.** `code/run_pipeline.sh` is the contract: fingerprint every tracked artifact, run
   every step from raw data, fingerprint again, and write a verdict per artifact.

   ```
     confirmed  rewritten and byte-identical   -> reproduced
     changed    rewritten and different        -> the previous version was wrong
     missing    existed before, not now        -> orphan
     untouched  on disk, mtime unchanged       -> its producer is not in the pipeline
     new        did not exist before
   ```

   Note what `untouched` really means: the pipeline did not rebuild it. That is a fact about the pipeline,
   not a compliment to the artifact.
4. **Do not track anything that cannot be byte-reproduced.** A `*_notes.txt` carrying a wall-clock
   timestamp, or a PDF (writers embed a creation timestamp), will read `changed` on every run forever —
   and a badge that is always red is a badge nobody reads.

---

## 7. Read the dashboard

1. **Checklist** — the grid and the Step 0 package cards. Red package cards are not a warning; they are
   the answer to "is the version I have the version I think I have".
2. **Figures** — every figure with its description on the card back, and the script that made it. A red
   `?` means no description yet, which keeps it out of the Pipeline until it has one.
3. **Tables** — the same, plus the verdict badge from the last pipeline run.
4. **Code** — the workshop: Pipeline / For Review / Sandbox.
5. **Data** — what raw data exists, where it came from, what consumes it.
6. **Diffs** *(git projects only)* — the bounded diff as the unit of verification. Marking a commit
   reviewed pays down verification debt and moves the scale.

---

## 8. Verify before you believe anything

Run these at their own moments; they are complements, not substitutes.

1. **`/pipeline`** — re-derives every exhibit from raw data and verdicts each one. Run it before writing
   numbers into prose, before a talk, and before a submission. It tells you how long it will take first.
2. **`/blindspot`** — *while* the output exists and before interpretation begins. Audits your perception:
   what is in front of you that you have stopped seeing. Same session is fine and better.
3. **`/referee2`** — *after* the work is complete, in a **fresh session**, never the one that built it. It
   hosts three modes: `deck` before a presentation ships, `code` before a submission, `drift` to reconcile
   every analytical sample against the anchor.
4. **`/drift-sweep`** — returning after a gap, or before anyone external reads the artifacts.
5. **`/bibcheck`** — once per manuscript, right before submission.

The rule underneath all of them: **the producer cannot grade its own exam.** That includes this assistant.

---

## 9. Every session, after the first

1. **Start with `/amnesia`.** It reads `STATE.md`, reconciles it against disk, and tells you where you
   are. It is cheap and it is the difference between resuming and re-deriving.
2. **Keep `STATE.md` live.** After each finished step, update what is done, what is in progress and what is
   next. Do not batch it to the end — the end is where sessions get interrupted.
3. **End with `/sleep`.** It writes a dated progress log, refreshes `STATE.md`, and leaves a two-line
   `TODAY.md` for tomorrow's `/amnesia`.
4. **When you learn something needs fixing, fix it or write it down the same turn.** A promise made in
   conversation is trusted to the two things that drift — your memory and mine. `/sleep` and `/amnesia`
   only read what is on disk.

---

## 10. Before you publish

1. **Sign off in the checklist.** Steps 1–8 have deliverables, Step 4's counts reconcile with Step 2's map,
   the power statement predates the estimate, and the estimator matches the choice.
2. **Write the manifest.** The canonical sign-off artifact is `analyses/<slug>/manifest.yaml` — panel
   fingerprint, package versions, every deliverable path. **Honest gap:** the checklist tells you to build
   it with `scripts/r/_manifest.R::write_manifest()`, and that helper is **not shipped in this repo yet**.
   Write the YAML by hand, or add the helper.
3. **File a card per defended claim**, and let `/referee2` `deck` and `code` have their pass first.
4. **Only then** set the frontmatter `status` to `complete` and lock `S_signoff`. Locking that last room is
   the switch that says the whole analysis is done.

---

## Known gaps, so you do not rediscover them

- **`scripts/r/_manifest.R` does not exist.** The checklist's sign-off step references it. Hand-write the
  YAML until it ships.
- **Where analyses keep their data is ambiguous.** `CLAUDE.md` says
  `analyses/<slug>/data/raw/`; every shipped script and the dashboard read the top-level `data/raw/`. The
  example follows the scripts. Pick one and record the choice.
- **`/covariates` was not run for the example** — its 13 covariates were inherited from the course
  replication. If you use the example as a template, do not inherit that shortcut with it.
- **`analyses/*/data/` is gitignored.** Your analysis folder travels; its data does not. That is on
  purpose, and it means a fresh clone cannot re-run your pipeline until the data is intaken again.

---

## Where to go next

- [`README.md`](README.md) — what the repo is, the install routes, the worked example with its numbers.
- [`CLAUDE.md`](CLAUDE.md) — the law. Read the four things in step 2, pull the rest when you need it.
- `analyses/brazil_caps/` — a walked example, published with its open gates visible rather than smoothed.
