# dsh-guards — the harness's pre-execution guardrails, native to DSH

A DSH bundle that ports the three **pre-execution** guardrails from
[`../hooks/`](../hooks) so they run as first-class guards instead of Claude Code
command hooks. The Claude Code originals stay where they are; they are the
specification this ports from.

```
dsh-guards/
├── package.json        # bundle manifest
├── cordis.patch.yml    # the one row that mounts the plugin
├── index.js            # the three guards
├── test.mjs            # the case matrix (node test.mjs)
└── README.md
```

## Why `ctx.tools.guard()` and not `tools/pre-execute`

The Python hooks signal by exit code: `exit 0` allows silently, `exit 2` blocks
with the reason on stderr. DSH has no stdin/exit-code contract, so the choice is
which extension point replaces it.

`tools/pre-execute` is a reorderable waterfall — useful when several plugins
should negotiate. A **guard** registers *after* that waterfall, is synchronous,
and is monotonic: per the `dsh-tools` documentation, a returned reason denies the
call and **"no later listener can turn that denial back into permission."**

These three rules are meant to hold unconditionally, so a guard is the correct
shape. For the same reason this bundle exposes no config that a higher patch
layer could loosen: installing it is the consent.

The deny path lands in the model as a tool error reading `Error: <reason>`, which
is exactly what stderr plus `exit 2` produced before.

## What is ported, and what is not

| Original hook | Status |
|---|---|
| `protect-raw-data` | ported |
| `no-fabricated-exhibit` | ported (both arms) |
| `no-offbook-exhibit` | ported |
| `deck-from-pipeline` | **not yet** — PostToolUse advisory, needs `code/run_pipeline.sh` discovery |
| `no-stale-canon` | **not yet** — same, plus `exhibits.md` parsing |

The two PostToolUse hooks are advisories: the tool has already run, so they warn
rather than block. In DSH that is a `tools/post-execute` listener attaching
context, not a guard. They also depend on the project's pipeline runner, which is
a separate decision — see "Known gaps" below.

## Five deliberate deviations from the Python

**[A] Tool names.** DSH's tools are `write`, `edit` and `pwsh`, with no
`MultiEdit` and no `NotebookEdit`. Two original code paths therefore disappear
rather than being ported: the `MultiEdit` branch that joined
`edits[].new_string`, and the `NotebookEdit` path. The originals registered a
`NotebookEdit` matcher but never handled it — a silent no-op — so nothing that
worked stops working.

**[B] `no-offbook-exhibit`'s `SCRATCH_RUN` escape hatch is repaired.** The Python
read `os.environ.get("SCRATCH_RUN")`, but a PreToolUse hook runs *before* the
tool's shell exists, so a `SCRATCH_RUN=1` prefix lives only in the command string
and never reaches the hook process. The documented escape hatch could not fire,
while the block message instructed the model to use it. Here a leading
`SCRATCH_RUN=<value>` in the command itself is honoured, and the inherited
environment variable still is too.

**[C] Backslashes.** `EMITS_RE` and `PLOT_RE` matched only `output/figures` and
`output/tables` with forward slashes, so a Windows-style reference was silently
*unmatched* — the rule looked enforced and was not. Both now accept either
separator.

**[D] Messages.** Reworded for DSH: no claim about a macOS kernel seal
(`root:wheel 555/444`), and no naming a person.

**[E] The skip-list no longer needs a leading separator.** The original pattern
`[/\\]hooks[/\\]` required a separator *before* `hooks`, so a relative
`hooks/x.py` was never skipped. That is not cosmetic:
`no-fabricated-exhibit.py`'s own source contains `fabricat` (in its docstring)
and `faker` (in its regex), so editing it through a relative path would have made
the guard block itself.

Everything else is a faithful port, including the deliberate residuals: a
tell-word with **no** RNG in sight is allowed, and a file whose *name* mentions
`power`, `_sim`, `placebo`, `conformal`, `boot` and friends is exempt from the
fabrication scan entirely.

## Coverage, including the gaps inherited from the Python

| tool | raw data immutable | no fabricated exhibit | no off-book exhibit |
|---|---|---|---|
| `write` / `edit` | yes | yes | n/a |
| shell (`pwsh` / `bash`) | **no — inherited gap** | yes | yes |

`protect-raw-data` deliberately does not watch the shell, so `mv`, `chmod`, a
redirect, or a script that rewrites raw data are **not** covered — the Python
docstring records that a Bash arm was built and then removed, and this port
preserves that decision rather than quietly widening it.

## Install

Sidebar → **Plugins** → install a bundle, absolute path:

```
C:\Users\english\Documents\mixtape\mixtape_harness\dsh-guards
```

Read the returned `application` field: `applied` is what means the change is
live. Do not hand-write the profile's `package.json` or `cordis.patch.yml`.

## Verify

The case matrix is self-contained — no fixtures are checked in:

```bash
node dsh-guards/test.mjs      # bundled node also works
```

It covers the allow and deny path of every guard, the `[B]` and `[E]` repairs,
the documented residuals, and that `apply()` registers exactly three guards and
returns a disposer.

Installed behaviour worth trying by hand: ask the agent to overwrite an existing
file under `data/raw/` (should be refused with a reason), and to write a `.py`
that `ggsave`s random numbers (should be refused).

## Rollback

Remove the bundle in the **Plugins** page. Nothing in the repo changes.

## API facts this port relies on

Verified against the shipped `@deepseek-ai/dsh-tools` module rather than assumed,
because the reference documentation asks that every service method and event be
confirmed before use:

* `ctx.tools.guard(guard)` registers a synchronous guard after the
  `tools/pre-execute` waterfall and returns its own disposer. A returned string
  denies.
* The execution object handed to a guard is
  `{ token, callId, rootCallId, name, signal, agent?, parent?, schema?, arguments, deferContext(), concludeTurn() }`,
  with `arguments` deep-frozen and JSON-serializable. `name` is the tool name;
  `arguments` is the tool's own argument object.
* The denial is materialized as `content: [{ type: 'text', text: 'Error: <reason>' }], isError: true`.

`node:fs` is imported directly and deliberately: a guard must be synchronous,
while the `ctx.fs` service is asynchronous.
