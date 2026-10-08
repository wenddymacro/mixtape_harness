# dsh-plugin — run this harness under DeepSeek Harness (DSH)

A **thin DSH bundle** that makes this harness's `skills/` directory available to
every DSH session in the profile. Two files, no JavaScript, no build step, no
dependencies.

```
dsh-plugin/
├── package.json        # the bundle manifest (declares dsh.bundle.patch)
├── cordis.patch.yml    # the one row that points at ../skills
└── README.md           # this file
```

---

## Why this is needed

The harness's 15 skills live in `skills/<name>/SKILL.md`. DSH's local skill
provider discovers skills from a fixed set of roots — `<projectRoot>/.dsh/skills`,
`<projectRoot>/.agents/skills`, `~/.dsh/skills`, `~/.agents/skills`, plus any
`customSkillDirs` — and `skills/` is not one of them.

The obvious fix would be to set `customSkillDirs` on the host
`skill-filesystem` row in the profile patch. **That does not work in DSH Web**:
the Web app bundle disables the host row and moves local discovery into each
agent preset, and **agent-preset rows are read-only**.

A bundle is the supported way around this. Deployment-level providers register
into the **global layer** of the skill registry, while a preset's provider
registers into that preset's layer, and each agent reads the merged catalog its
scope chain selects. So one row inserted by an installed bundle reaches every
agent — and the preset's own row is left alone.

## Install

1. Open the DSH Web sidebar → **Plugins**.
2. Choose to install a bundle and give it this directory as an **absolute
   path**:

   ```
   C:\Users\english\Documents\mixtape\mixtape_harness\dsh-plugin
   ```

   (On this machine that is the checkout you are reading. On another machine,
   any path containing this `dsh-plugin/` folder.)

3. Read the returned `application` and `warnings` fields. `application: applied`
   is what means the change is live — not server logs or the page's boot
   payload.

Do **not** hand-write the profile's `package.json` or `cordis.patch.yml`, and do
not run `pnpm` in the profile directory. The installer performs those steps.

### The one value to edit first

`cordis.patch.yml` contains a single machine-specific line:

```yaml
        customSkillDirs:
          - 'C:/Users/english/Documents/mixtape/mixtape_harness/skills'
```

Point it at **your** checkout of this repo. Keep it absolute; forward slashes
work on Windows and POSIX. This is deliberately a plain, visible value rather
than a computed one: the patch is parsed once at process start, so there is no
session or workspace context available to derive the path from.

## Verify

Start a **new session** (or check the next catalog refresh) and confirm the
harness skills are listed — you should see `amnesia`, `covariates`, `referee2`,
`drift-sweep`, `blindspot`, `pipeline`, `bibcheck`, `split-pdf`,
`beautiful-deck`, `three-pager`, `outline`, `quiz`, `r1`, `sleep`,
`newproject`. Then invoke one directly, e.g. ask for `/amnesia`.

The skills already present before this bundle (the office and sandbox-diagnosis
skills) must still be there — this bundle adds a provider, it does not replace
one.

## Why it points instead of copies

`customSkillDirs` makes DSH read `skills/` **where it already lives**. That is
the whole point, and it matters for anyone editing the harness:

* Edit `skills/covariates/SKILL.md` → the change is live on the next catalog
  refresh, with nothing to re-sync.
* A commit or PR touches exactly the file the agent actually read. No second
  copy exists to drift out of date.

Copying the skills into `.dsh/skills` would work once and then quietly lie:
you would edit the original, the agent would keep reading the stale copy, and
the effect of the edit would be invisible. The provider watches its roots, so
pointing at the source is also the configuration that refreshes by itself.

## Rollback

Remove the bundle in the **Plugins** page. This plugin changes nothing inside
the repo, so removing it leaves the harness exactly as it was.

## What this bundle deliberately does NOT do

| Part of the harness | Why it is not in here |
|---|---|
| `CLAUDE.md` | Already loaded natively. DSH's `agent-instructions` reads project-level `CLAUDE.md` (from the `.git` root down to the working directory) and re-injects the rules every session. Nothing to add. |
| `checklists/`, `analyses/` | These are *content*, not behaviour. The agent reads them with ordinary file tools; `analyses/<slug>/` is mutable per-analysis state (stage locks, `findings.md`) and must live inside the workspace, not in an installed bundle. |
| `dashboard_server.py` | A standalone human-facing app (`ROOT = Path(os.getcwd())`, stdlib only, port 8080). The agent never needs it — it reads `ACTIVE_STAGE`, `LOCKED` and `checklist.md` directly. Rewriting 4,600 lines as a host route plus a client UI plugin would lose the properties that make it work anywhere. |
| `hooks/*.py` | The five guardrails are still the Claude Code form and require that bridge to be mounted separately. A native DSH port would attach to the tool pre/post-execute extension points instead — worth doing later, and independent of this bundle. |

The rule this bundle follows: **the plugin carries behaviour; the workspace
carries content and state.**
