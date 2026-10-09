---
name: dashboard
description: Put the harness dashboard in front of the user — start it if it is not running, then hand back the URL as a clickable link so DSH opens it in the right-sidebar browser beside the session. Use when the user says "dashboard", "open the dashboard", "show me the dashboard", "把仪表盘打开", "看仪表盘", or invokes /dashboard. Also use before showing the user any dashboard view, so the link they get is the live one.
allowed-tools: Bash(bash code/open_dashboard.sh*), Read, Grep, Glob
---

# /dashboard — get the dashboard in front of the user's eyes

One job: make sure the dashboard is running, and hand back a link that lands in
the right-sidebar browser next to this session.

## Steps

1. **Start it (idempotent).** From the project root:

   ```
   bash code/open_dashboard.sh
   ```

   stdout is the URL on its own line. stderr carries the narration (already
   running / starting / pid / ready). The script is safe to run repeatedly — if
   the port already answers, it prints the URL and does nothing else. It waits up
   to 30s for a cold start and exits non-zero if the server never comes up; if
   that happens, read the log path it printed instead of retrying blindly.

2. **Post the URL as a BARE link on its own line.** Not in backticks, not inside
   a sentence with other punctuation glued to it:

   ```
   http://localhost:8080/
   ```

   Backticks make it *code*, not a link, and DSH will not navigate it. The link
   must be its own token.

3. **Tell the user the one-click rule, once.** DSH's
   **Settings → General → "Open chat links in"** must be **In-App Sidebar** (it
   is the default). Then clicking the link opens a new right-Sidebar Browser tab
   showing the dashboard, which keeps updating live while the session continues.

## What the user gets when it opens

- A **status strip** at the top of every view: `● RUNNING — step 8 of 10 (80%)…`
  while `code/run_pipeline.sh` runs, `● IDLE` when it is not, `● STOPPED EARLY`
  if a run died. It polls `/api/pipeline` every 3 s and the page reloads itself
  once when a run finishes, so nothing needs refreshing by hand.
- **UI language toggle** in the sidebar header (`中文` / `EN`). It persists in a
  `dsh-lang` cookie. It switches the *chrome* only — figure captions, tables and
  findings keep the language their author wrote them in, deliberately.
- The **Official Pipeline box** on the Checklist and Tables views: the command,
  the last run's verdict and its duration.

## Language

To hand the user the Chinese UI directly, append `?lang=zh` to the URL:
`http://localhost:8080/?lang=zh`. The cookie takes over from the next request.

## What this cannot do (and why)

It cannot open the sidebar tab **without a click**. That needs a DSH *client*
plugin calling `ctx.sidebarRight.openTab('browser', { params: { url } })`, and
this installation is a packaged `app.asar` — no source tree, no `pnpm` — so a new
client plugin cannot be built into it from the project side. If a DSH source
checkout becomes available, that plugin is a small, well-scoped piece of work;
say so rather than improvising a workaround that half-works.

## Do not

- Do not start a second server on another port to "make it work". One dashboard,
  one port (`PORT` env var overrides 8080 for a deliberate reason only).
- Do not paste the raw HTML or curl the page and describe it. The user wants the
  link, not a transcript.
