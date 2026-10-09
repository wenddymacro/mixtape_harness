# dsh-plugin — RETIRED (tombstone)

> **This folder is a tombstone.** The bundle that makes this harness's `skills/`
> available to DSH now lives at the **repository root** (`package.json`,
> `cordis.patch.yml`, `index.js`, `test.mjs`). Install that one. See
> [README.md](../README.md#install-under-dsh-windows--macos--linux).
>
> **Retired:** 2026-10 — for being machine-specific.
> **Replaced by:** the root bundle — no path to edit on any OS.
> **Nothing here was deleted:** `package.json` had its `dsh.bundle` declaration
> removed so the plugin installer rejects this directory as *not-a-bundle* rather
> than installing a bundle that silently finds no skills, and
> `cordis.patch.yml` was emptied of the Windows path it used to carry.

## Why it was retired

`cordis.patch.yml` carried one machine-specific value, which is what a bundle
like this needs if the path is written as YAML:

```yaml
        customSkillDirs:
          - 'C:/Users/english/Documents/mixtape/mixtape_harness/skills'
```

DSH runs each `customSkillDirs` entry through `path.resolve` before scanning, so
`~` is never expanded and a relative path depends on the server's cwd — the only
path that works in YAML is absolute, and an absolute path is wrong on the other
two operating systems. On macOS or Linux this bundle installed cleanly and then
found **no skills at all, silently**.

The root bundle removes the path instead of fixing it: `index.js` derives
`<this package>/skills` from its own module URL. The same checkout therefore
works on Windows, macOS, and Linux with nothing to edit, and `test.mjs` fails if
a path ever reappears in the patch.

## Why a bundle is needed at all (still true)

The harness's skills live in `skills/<name>/SKILL.md`. DSH's local skill provider
discovers skills from a fixed set of roots — `<projectRoot>/.dsh/skills`,
`<projectRoot>/.agents/skills`, `~/.dsh/skills`, `~/.agents/skills`, plus any
`customSkillDirs` — and `skills/` is not one of them.

Setting `customSkillDirs` on the host `skill-filesystem` row in the profile patch
does not work in DSH Web: the Web app bundle disables the host row and moves local
discovery into each agent preset, and **agent-preset rows are read-only**.

A bundle is the supported way around this. Deployment-level providers register
into the **global layer** of the skill registry, while a preset's provider
registers into that preset's layer, and each agent reads the merged catalog its
scope chain selects. So one row inserted by an installed bundle reaches every
agent — and the preset's own row is left alone. `includeDefaultRoots: false` on
the mounted provider keeps it from double-registering the roots that preset
provider already covers.
