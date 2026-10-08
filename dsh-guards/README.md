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

## Why the advisories use `tools/post-execute`

`deck-from-pipeline` and `no-stale-canon` are different in kind: the write has
already happened and **must stand**. `exit 2` on a PostToolUse hook is a message
to the model, not a veto, and the two hooks say so — `no-stale-canon`'s own
message reads "(warn, not block)".

So they are not guards. They are a `tools/post-execute` listener that attaches an
`additionalContexts` message. Per the `dsh-tools` documentation, an `accept`
decision "keeps the call successful" while "either decision may attach
`additionalContexts`, which are ferried on the returned result" — the result
stands and the warning rides along to the model. Same outcome, right mechanism.

Such a listener does not own the decision, so it awaits `next()` and **spreads**
whatever came back, adding only `additionalContexts`. With nothing to say it
returns the downstream decision untouched, so it stays invisible to every other
plugin in the chain.

The context itself is built with `createUserMessage` from `@deepseek-ai/dsh-llm`,
tagged `source: { kind: 'plugin' }` — a kind dsh itself uses for
plugin-injected context. That import is **lazy**, for two reasons: dsh resolves
its own packages at runtime but a bare `node` run from this checkout cannot, so a
static import would make the test matrix unrunnable; and a load-time failure
would take the three working guards down with it. If the import ever fails, the
advisories are skipped and the guards keep working — the failure mode is a
missing warning, never a broken write.

## What is ported

| Original hook | Mechanism |
|---|---|
| `protect-raw-data` | `ctx.tools.guard()` |
| `no-fabricated-exhibit` (both arms) | `ctx.tools.guard()` |
| `no-offbook-exhibit` | `ctx.tools.guard()` |
| `deck-from-pipeline` | `tools/post-execute` advisory |
| `no-stale-canon` | `tools/post-execute` advisory |

All five are ported. The two advisories only do anything in a project that has a
`code/run_pipeline.sh`: `findRoot` walks up from the file being written and gives
up silently when there is no runner, which is what the Python does too. In this
harness repo there is no runner, so they are inert here and functional in an
analysis project.

## Six deliberate deviations from the Python

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

**[F] `no-stale-canon`'s entry pattern no longer hides hyphenated producers.** It
captured the script with `[^\s—-]+`, which excludes hyphens — so
`` `fig.png` — src: code/03-my-figure.py `` did not match at all. The entry was
not reported MISSING or UNWIRED; it was **invisible**, which is worse, because
the check then silently under-enforces while appearing to pass. The capture now
stops at whitespace.

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

The two advisories fire on `write` / `edit` only, matching the originals'
`Edit|Write|MultiEdit` registration (DSH has no `MultiEdit`).

## Known leniency inherited from the Python

Not changed here, because each would alter what the check *enforces* rather than
how it runs. Both make a check weaker than it reads:

* `wiredSourceBlob` appends the whole runner text **after** filtering comments,
  so a figure name mentioned anywhere in `run_pipeline.sh` — including inside a
  comment — counts as "wired".
* Only whole-line comments are skipped when scanning the runner. A **trailing**
  comment (`# python3 code/x.py` at the end of a code line) counts as wired.

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

It runs 61 checks and covers both the allow and deny path of every guard, both
advisory checks against a miniature project (a runner, a deck, a stage canister
with each of MISSING / UNWIRED / STALE), the `[B]`, `[E]` and `[F]` repairs, the
documented residuals, and the wiring: that `apply()` registers exactly three
guards plus one `tools/post-execute` listener, and that the listener returns the
downstream decision **unchanged** when it has nothing to say and **spreads** it
when it does, rather than replacing it.

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
* `tools/post-execute` is a waterfall over `(exec, result, next)`. Its decision is
  `{ kind: 'accept', content?, value?, additionalContexts? }` or
  `{ kind: 'block', feedback, additionalContexts? }`; `accept` keeps the call
  successful, and `additionalContexts` are ferried on the returned result.
* A context attached to `additionalContexts` is a message built by
  `createUserMessage({ content, source: { kind } })` from `@deepseek-ai/dsh-llm`.
  `source.kind: 'plugin'` is one dsh itself uses.
* `apply(ctx)` returning a function is the dispose path, and `ctx.on(event, listener)`
  returns its own disposer.
* The plugin declares `export const inject = ['tools']`. Without it the loader
  activates the plugin immediately, and touching `ctx.tools` before the registry
  is mounted throws -- the whole plugin fails to load rather than registering.
  Declaring the dependency makes activation wait for the service. **This was the
  cause of the first install appearing to succeed while doing nothing.**

`node:fs` is imported directly and deliberately: a guard must be synchronous,
while the `ctx.fs` service is asynchronous.
