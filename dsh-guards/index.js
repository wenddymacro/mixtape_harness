/**
 * Native DSH ports of the harness's three PRE-execution guardrails.
 *
 * The Claude Code originals are command hooks (`../hooks/*.py`): each reads a
 * JSON event on stdin and signals by exit code -- exit 0 = allow, exit 2 = block
 * with the reason on stderr. DSH has no stdin/exit-code contract, so each hook
 * becomes a `ctx.tools.guard()`:
 *
 *   - A guard is synchronous and MONOTONIC, and it registers after the
 *     extensible `tools/pre-execute` waterfall, so no later listener can turn
 *     its denial back into permission. That is the right shape for rules meant
 *     to hold unconditionally.
 *   - Returning a string denies; the harness renders it to the model as
 *     `Error: <reason>` -- the same thing Claude Code does with stderr + exit 2.
 *   - Returning undefined allows, silently -- the equivalent of exit 0 with no
 *     output, which is what every original hook does on the allow path.
 *
 * Neither original ever wrote stdout or used any of the structured hook-output
 * fields (`decision`, `reason`, `hookSpecificOutput`, `permissionDecision`,
 * `continue`, `systemMessage`). There is therefore no structured output to
 * translate: allow is silence, and block is one message.
 *
 * Four deliberate deviations from the Python, each marked [A]-[D] below where
 * it applies and all four listed in README.md:
 *   [A] DSH tool names are `write` / `edit` / `pwsh`, not `Write` / `Edit` /
 *       `Bash`. There is no MultiEdit and no NotebookEdit, so two of the
 *       original code paths disappear rather than being ported.
 *   [B] `no-offbook-exhibit`'s SCRATCH_RUN escape hatch is repaired -- as
 *       written in Python it could never fire.
 *   [C] Path-bearing patterns accept backslashes, so Windows-style references
 *       are enforced instead of silently unmatched.
 *   [D] Messages are reworded for DSH (no macOS kernel-seal claim, no naming a
 *       person).
 *   [E] The skip-list pattern no longer requires a leading separator, so a
 *       relative `hooks/x.py` is skipped like an absolute one. As written, the
 *       guard's own source (which contains "fabricat" and "faker") could be
 *       blocked by itself when edited through a relative path.
 *   [F] `no-stale-canon`'s entry pattern captured the producer script with
 *       `[^\s—-]+`, which excludes hyphens -- so `src: code/03-my-figure.py` did
 *       not match at all and the whole entry was invisible, not even reported
 *       MISSING. The capture now stops at whitespace only.
 *
 * `node:fs` is imported directly, deliberately. A guard must be synchronous, and
 * the `ctx.fs` service is asynchronous, so the synchronous fs calls existSync /
 * realpathSync / readFileSync are the only ones usable here.
 *
 * ---------------------------------------------------------------------------
 * The two POST-execution guardrails (`deck-from-pipeline`, `no-stale-canon`) are
 * advisories, not blocks: the write has already happened and must stand, and the
 * original signalled exactly the same way (`exit 2` on a PostToolUse hook is a
 * message to the model, not a veto).
 *
 * The DSH equivalent is a `tools/post-execute` listener that attaches an
 * `additionalContexts` message. Per the dsh-tools documentation, an `accept`
 * decision "keeps the call successful" while "either decision may attach
 * additionalContexts, which are ferried on the returned result". So the result
 * stands and the warning rides along to the model -- the same outcome.
 *
 * Such a listener does not own the decision, so it awaits `next()` and spreads
 * the downstream decision rather than replacing it.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * `@deepseek-ai/dsh-llm` ships with dsh, so the bundle declares no dependency on
 * it. It is imported LAZILY rather than at load time for two reasons: dsh resolves
 * its own packages at runtime but a bare `node` run from this checkout cannot, so
 * a static import would make the test matrix unrunnable; and a load-time failure
 * would take the three working guards down with it.
 */
let llmModule;
async function defaultMessageContext(text) {
  if (llmModule === undefined) {
    try {
      llmModule = await import('@deepseek-ai/dsh-llm');
    } catch {
      llmModule = null;
    }
  }
  if (llmModule === null || typeof llmModule.createUserMessage !== 'function') return null;
  return llmModule.createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'plugin' }, // a kind dsh itself uses for plugin-injected context
  });
}

/** The shell tool is `pwsh` on Windows and `bash` elsewhere; both are covered. */
const SHELL_TOOLS = new Set(['pwsh', 'bash']);

/** Tools whose arguments can name a file to be written, and the arg holding it. */
const WRITE_TOOLS = new Set(['write', 'edit']);

// ---------------------------------------------------------------------------
// protect-raw-data
// ---------------------------------------------------------------------------

/** A `data/raw/` path segment anywhere in the resolved path. [C] both separators. */
const RAW_RE = /[/\\]data[/\\]raw[/\\]/i;

function guardRawData(exec) {
  if (!WRITE_TOOLS.has(exec.name)) return;
  const args = exec.arguments;
  if (args === null || typeof args !== 'object') return;

  // `file_path` first, then `notebook_path` -- the original's fallback order.
  const target = args.file_path || args.notebook_path;
  if (!target) return;

  let resolved = String(target);
  try {
    // Collapses symlinks and `..`, so a parent symlink cannot hide `raw/`.
    resolved = fs.realpathSync(resolved);
  } catch {
    // Non-existent path: keep the literal, matching the original's tolerance.
  }

  if (!RAW_RE.test(resolved)) return;
  if (!fs.existsSync(resolved)) return; // a NEW file in data/raw/ is allowed

  return [
    'BLOCKED by protect-raw-data: this path is an EXISTING file inside a data/raw/ directory,',
    'which is IMMUTABLE (provenance RULE OF LAW -- raw source data is never modified).',
    'Read it, and WRITE transformed output to data/derived/ (or the project\'s derived dir)',
    'via a named script, so the chain real -> code -> exhibit stays traceable.',
    `    attempted: ${target}`,
    'Adding a NEW file to data/raw/ is allowed. Replacing an existing raw file is a deliberate',
    'step the maintainer runs outside the agent.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// no-fabricated-exhibit
// ---------------------------------------------------------------------------

const SCRIPT_RE = /\.(py|R)$/i;
/**
 * [E] The Python pattern was `[/\\]hooks[/\\]`, which needs a separator BEFORE
 * `hooks` -- so a RELATIVE `hooks/x.py` was never skipped. That is not cosmetic:
 * `no-fabricated-exhibit.py` contains `fabricat` (in its own docstring) and
 * `faker` (in its own regex), so editing it through a relative path would make
 * the guard block itself. Anchoring the separator to the start of the string as
 * well closes that hole.
 */
const SKIP_RE = /(^|[/\\])\.claude[/\\]|(^|[/\\])hooks[/\\]|site-packages|node_modules|(^|[/\\])\.git[/\\]/i;
/** [C] `output/figures` and `output/tables` also match with a backslash. */
const EMITS_RE = /ggsave|savefig|plt\.save|pdftoppm|output[/\\]figures|output[/\\]tables/i;
const FAB_RE =
  /\bsynthetic\b|\billustrative\b|for illustration|\bmade[\s\-_]?up\b|\bfabricat|\bdummy[\s_]?data\b|\bplaceholder[\s_]?data\b|\bfake\b|\bmock[\s_]?data\b/i;
const SYNTH_CONTROL_RE =
  /synthetic\s+control|synthetic\s+did|synth[\s_]?did|augsynth|\btidysynth\b|multisynth|\bsynth\b|synthetic\s+counterfactual/gi;
const MC_HEADER_RE =
  /#\s*(MONTE\s*CARLO|SIMULAT|placebo\s+draws|null\s+distribution|randomization\s+inference)/i;
/** A file whose NAME contains any of these is exempt (power runs, sims, placebos). */
const MC_NAME_RE =
  /power|_sim|montecarlo|monte_carlo|permut|placebo|randomiz|conformal|boot|_mc\b|_ri\b/i;
const GEN_SIGNAL_RE =
  /\brnorm\b|\brunif\b|\brbinom\b|\brpois\b|\brgamma\b|\brbeta\b|\brexp\b|np\.random|numpy\.random|\.normal\(|\.uniform\(|\.randint\(|\brandom\.|\bmake_blobs\b|\bmake_classification\b|\bfaker\b|\bFaker\b/i;
const RUN_SCRIPT_RE =
  /(?:python[0-9.]*|Rscript)\s+(?:-[^\s]+\s+)*([^\s;|&<>]+\.(?:py|R))|R\s+CMD\s+BATCH\s+(?:-[^\s]+\s+)*([^\s;|&<>]+\.R)/gi;

/**
 * The shared predicate, in the original's exact order. Returns the offending
 * tell-word, or null to allow.
 */
function fabricatedTell(content, filePath) {
  const base = path.basename(filePath || '');
  if (MC_NAME_RE.test(base)) return null; // sim/power filename: exempt, unscanned
  if (!EMITS_RE.test(content)) return null; // not an exhibit producer
  if (MC_HEADER_RE.test(content)) return null; // acknowledged Monte Carlo

  // Delete legitimate synthetic-control vocabulary before scanning for fakes.
  const scrubbed = content.replace(SYNTH_CONTROL_RE, ' ');
  const hit = FAB_RE.exec(scrubbed);
  if (!hit) return null;
  // A tell-word with no RNG in sight is the documented residual: allow it.
  if (!GEN_SIGNAL_RE.test(scrubbed)) return null;
  return hit[0];
}

function fabricatedMessage(hit, via, filePath) {
  return [
    `BLOCKED by no-fabricated-exhibit: the ${via} looks like it produces a figure or table`,
    `from data it invents. The tell-word is "${hit}".`,
    'Exhibits must be built from real data, or be a labelled Monte Carlo (a `# MONTE CARLO`,',
    '`# SIMULATION`, `# placebo draws`, `# null distribution` or `# randomization inference`',
    'header, in a file whose name marks it as such).',
    'Either point it at the real data, or add the Monte Carlo header and say so in the text.',
    'If the user has explicitly asked you to synthesise anyway, STOP and ask them verbatim:',
    '"Are you sure?" -- and wait for the answer before continuing.',
    `    ${via}: ${filePath}`,
  ].join('\n');
}

function guardFabricated(exec) {
  const args = exec.arguments;
  if (args === null || typeof args !== 'object') return;

  // Arm W -- a file being written.
  if (exec.name === 'write' || exec.name === 'edit') {
    const filePath = args.file_path || '';
    if (!filePath) return;
    if (!SCRIPT_RE.test(filePath)) return;
    if (SKIP_RE.test(filePath)) return;
    // [A] `write` carries `content`; `edit` carries `new_string`. The original
    // also handled MultiEdit's `edits[].new_string`, which DSH does not have.
    const content =
      exec.name === 'write'
        ? typeof args.content === 'string'
          ? args.content
          : ''
        : typeof args.new_string === 'string'
          ? args.new_string
          : '';
    const hit = fabricatedTell(content, filePath);
    return hit ? fabricatedMessage(hit, 'file', filePath) : undefined;
  }

  // Arm B -- a shell command that runs a script; read those scripts off disk.
  if (!SHELL_TOOLS.has(exec.name)) return;
  const command = typeof args.command === 'string' ? args.command : '';
  if (!command) return;
  // DSH's shell tool carries its own `workdir`, which is more accurate than the
  // original's event cwd. Fall back to the host process cwd.
  const cwd = typeof args.workdir === 'string' && args.workdir ? args.workdir : process.cwd();

  for (const match of command.matchAll(RUN_SCRIPT_RE)) {
    const token = match[1] ?? match[2];
    if (!token) continue;
    const candidate = [token, path.join(cwd, token)].find(
      (p) => p && fs.existsSync(p) && fs.statSync(p).isFile(),
    );
    if (!candidate) continue;
    if (SKIP_RE.test(candidate)) continue;
    let content;
    try {
      content = fs.readFileSync(candidate, 'utf8');
    } catch {
      continue; // fail open, as the original does
    }
    const hit = fabricatedTell(content, candidate);
    if (hit) return fabricatedMessage(hit, 'runs', candidate);
  }
}

// ---------------------------------------------------------------------------
// no-offbook-exhibit
// ---------------------------------------------------------------------------

const INLINE_CODE_RE =
  /\b(?:python3?|ipython|bpython)\s+(?:-\S+\s+)*-c\b|\b(?:Rscript|R)\s+(?:-\S+\s+)*-e\b/i;
const HEREDOC_RE = /\b(?:python3?|Rscript|R)\b[^\n]*<<-?\s*['"]?\w+/i;
/** [C] exhibit directories also match with a backslash. */
const PLOT_RE =
  /savefig|ggsave|\bplt\.|pyplot|matplotlib|seaborn|\bsns\.|plotnine|\bggplot\b|\bpdf\s*\(|\bpng\s*\(|\bjpeg\s*\(|\bsvg\s*\(|output[/\\]figures|output[/\\]tables|\.savefig|fig\.save/i;

/**
 * [B] The Python read `os.environ.get("SCRATCH_RUN")` in the hook process, but a
 * PreToolUse hook runs before the tool's shell exists, so a `SCRATCH_RUN=1`
 * prefix lives only in the command string and never reaches the environment.
 * The documented escape hatch therefore never worked. Here the prefix is
 * honoured where it actually appears: leading the command.
 */
function scratchRunRequested(command) {
  if (process.env.SCRATCH_RUN) return true;
  return /^\s*(?:\w+=\S*\s+)*SCRATCH_RUN=\S*\s/.test(command);
}

function guardOffbook(exec) {
  if (!SHELL_TOOLS.has(exec.name)) return;
  const args = exec.arguments;
  if (args === null || typeof args !== 'object') return;
  const command = typeof args.command === 'string' ? args.command : '';
  if (!command.trim()) return;
  if (scratchRunRequested(command)) return;

  const isInline = INLINE_CODE_RE.test(command) || HEREDOC_RE.test(command);
  if (!isInline) return;
  if (!PLOT_RE.test(command)) return;

  return [
    'BLOCKED by no-offbook-exhibit: this draws a figure or table inline in a shell command.',
    'An exhibit with no producer file cannot be re-run, re-styled, audited, or reconciled --',
    'it loses the thread back to the data.',
    'Put the plot in a NAMED script (e.g. code/<slug>_<stage>_<purpose>.py, or .R) and wire it',
    'into code/run_pipeline.sh in dependency order.',
    'Deliberate throwaway work passes with the prefix in the command itself:',
    '    SCRATCH_RUN=1 python3 -c "..."',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Post-execution advisories: deck-from-pipeline, no-stale-canon
// ---------------------------------------------------------------------------

/**
 * Walk up from the target file's own directory looking for `code/run_pipeline.sh`.
 * Deliberately NOT a project root: the originals anchor on the file being
 * written, which is what makes a deck or canister outside the project tree a
 * silent no-op instead of an error. The filesystem root itself is never tested,
 * matching the Python.
 */
function findRoot(startPath) {
  const resolved = path.resolve(startPath);
  const stop = path.parse(resolved).root;
  let dir = path.dirname(resolved);
  while (dir !== stop) {
    try {
      if (fs.statSync(path.join(dir, 'code', 'run_pipeline.sh')).isFile()) return dir;
    } catch {
      /* not here; keep walking up */
    }
    dir = path.dirname(dir);
  }
  return null;
}

/** How the originals recognise a wired script: case-sensitive, and launcher-limited. */
const INVOKE_RE = /(?:python3?|Rscript|bash|sh)\s+(?:-\S+\s+)*([^\s;|&]+\.(?:py|R|r|sh))/g;

/** The runner's lines, or null when this project has no runner. */
function runnerLines(root) {
  try {
    return fs.readFileSync(path.join(root, 'code', 'run_pipeline.sh'), 'utf8').split(/\r?\n/);
  } catch {
    return null;
  }
}

/** Basenames of the scripts the runner invokes on a non-comment line. */
function wiredBasenames(root) {
  const out = new Set();
  for (const line of runnerLines(root) ?? []) {
    if (line.trimStart().startsWith('#')) continue;
    for (const match of line.matchAll(INVOKE_RE)) out.add(path.basename(match[1]));
  }
  return out;
}

/** Concatenated source of every script the runner invokes, plus the runner itself. */
function wiredSourceBlob(root) {
  const lines = runnerLines(root);
  if (lines === null) return null;
  const parts = [];
  for (const line of lines) {
    if (line.trimStart().startsWith('#')) continue;
    for (const match of line.matchAll(INVOKE_RE)) {
      const token = match[1];
      const target = path.isAbsolute(token) ? token : path.join(root, token);
      try {
        if (fs.statSync(target).isFile()) parts.push(fs.readFileSync(target, 'utf8'));
      } catch {
        /* unreadable script: skip it, as the Python does */
      }
    }
  }
  parts.push(lines.join('\n'));
  return parts.join('\n');
}

/**
 * Every prefix of three or more underscore-separated tokens, longest first, then
 * the whole stem. A two-token name yields only itself. This is what lets a
 * dynamically-built name such as `proj_outcome_permonth_fullpool_53053.png` match
 * its producer's literal prefix `proj_outcome_permonth_`.
 */
function stems(name) {
  const stem = name.replace(/\.(png|pdf)$/i, '');
  const parts = stem.split('_');
  const out = [];
  for (let k = parts.length; k > 2; k -= 1) out.push(parts.slice(0, k).join('_'));
  out.push(stem);
  return out;
}

const DECK_RE = /(decks[/\\].*\.html$)|(\.tex$)/i;
/** [C] backslashes are allowed so a Windows-style reference is found, not missed. */
const FIG_RE = /[A-Za-z0-9_./\\-]+\.(?:png|pdf)/g;
const EXHIBIT_DIR_HINTS = ['img/', 'tbl/', 'output/figures', 'output/tables', '/figures/', '/tables/'];
const SKIP_HINTS = ['assets/', 'logo', 'icon', '_template', 'screenshot', 'dash_'];

/** [C] Normalise separators before hint matching; the Python assumed `/`. */
function isExhibitRef(ref) {
  const low = ref.replace(/\\/g, '/').toLowerCase();
  if (SKIP_HINTS.some((hint) => low.includes(hint))) return false;
  return EXHIBIT_DIR_HINTS.some((hint) => low.includes(hint));
}

function checkDeckFromPipeline(exec) {
  if (exec.name !== 'write' && exec.name !== 'edit') return;
  const filePath = exec.arguments?.file_path;
  if (typeof filePath !== 'string' || !filePath) return;
  if (!DECK_RE.test(filePath)) return;
  const root = findRoot(filePath);
  if (root === null) return;
  const blob = wiredSourceBlob(root);
  if (blob === null) return;

  let deck;
  try {
    deck = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  const refs = [...new Set(deck.match(FIG_RE) ?? [])].filter(isExhibitRef);
  const violations = refs
    .filter((ref) => !stems(path.basename(ref)).some((stem) => blob.includes(stem)))
    .sort();
  if (violations.length === 0) return;

  return [
    'WARNING from deck-from-pipeline: this deck or manuscript references exhibit(s) that NO script',
    'wired into code/run_pipeline.sh produces, so the pipeline cannot rebuild them:',
    ...violations.map((ref) => `    - ${path.basename(ref)}`),
    "This is the 'vibed exhibit' failure mode. Either wire the producing script into",
    "code/run_pipeline.sh and re-run it clean, or remove the reference -- 'exists on disk' and",
    "'ran once in chat' are not enough.",
    'If this is a false positive (a dynamically-named figure the producer does not match), say so',
    'and widen this check rather than deleting the reference.',
  ].join('\n');
}

/**
 * [F] The script capture stops at whitespace only. The Python's `[^\s—-]+` also
 * excluded hyphens, so `src: code/03-my-figure.py` never matched and the entry
 * was invisible rather than reported.
 */
const ENTRY_RE =
  /`([^`]+\.(?:png|pdf|tex)(?:\/\.(?:png|pdf|tex))*)`\s*[—-]+\s*src:\s*([^\s]+\.(?:py|R|r))/gi;

/** Expand the `name.png/.pdf` shorthand into both files. */
function expandPaths(raw) {
  const parts = raw.split('/.');
  if (parts.length === 1) return [raw];
  const base = parts[0];
  const stem = base.replace(/\.[^.]+$/, '');
  return [base, ...parts.slice(1).map((ext) => `${stem}.${ext}`)];
}

function checkStaleCanon(exec) {
  if (exec.name !== 'write' && exec.name !== 'edit') return;
  const filePath = exec.arguments?.file_path;
  if (typeof filePath !== 'string' || !filePath) return;
  if (path.basename(filePath) !== 'exhibits.md') return;

  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  if (!text.includes('CANON (')) return;
  const root = findRoot(filePath);
  if (root === null) return;
  const wired = wiredBasenames(root);

  const missing = [];
  const unwired = [];
  const stale = [];
  for (const match of text.matchAll(ENTRY_RE)) {
    const scriptRel = match[2];
    const scriptBase = path.basename(scriptRel);
    const scriptAbs = path.isAbsolute(scriptRel) ? scriptRel : path.join(root, scriptRel);
    for (const figRel of expandPaths(match[1])) {
      const figAbs = path.isAbsolute(figRel) ? figRel : path.join(root, figRel);
      let figStat;
      try {
        figStat = fs.statSync(figAbs);
      } catch {
        missing.push(figRel); // missing short-circuits the other two, as in the Python
        continue;
      }
      if (!wired.has(scriptBase)) {
        unwired.push(`${figRel}  (src ${scriptBase} not in code/run_pipeline.sh)`);
      }
      try {
        if (figStat.mtimeMs < fs.statSync(scriptAbs).mtimeMs) {
          stale.push(`${figRel}  (older than ${scriptBase})`);
        }
      } catch {
        /* producing script absent: the stale test is skipped, as in the Python */
      }
    }
  }
  if (missing.length === 0 && unwired.length === 0 && stale.length === 0) return;

  const out = [
    'WARNING from no-stale-canon: this stage is being CANONIZED, but some exhibits are not',
    "'right and live'. The exhibits.md was saved (warn, not block) -- fix these so the wall can be trusted:",
  ];
  const group = (title, items) => {
    if (items.length > 0) out.push('', title, ...items.map((item) => `    - ${item}`));
  };
  group('MISSING (marked canon but the file is not on disk):', missing);
  group('UNWIRED (no pipeline script rebuilds it -- it cannot be regenerated):', unwired);
  group('STALE (the figure is OLDER than its script -- code changed, figure did not; re-run it):', stale);
  return out.join('\n');
}

const POST_CHECKS = [checkDeckFromPipeline, checkStaleCanon];

/** Every advisory message this tool call should carry, in registration order. */
function postExecuteWarnings(exec) {
  return POST_CHECKS.map((check) => check(exec)).filter(
    (message) => typeof message === 'string' && message.length > 0,
  );
}

/**
 * The `tools/post-execute` listener body.
 *
 * It does NOT own the decision: it awaits `next()` and spreads whatever came back,
 * adding only `additionalContexts`. With nothing to say it returns the downstream
 * decision untouched, so it stays invisible to every other plugin in the chain.
 *
 * `makeContext` is injectable so the test matrix can exercise this without a dsh
 * installation; the default resolves `createUserMessage` lazily.
 */
async function postExecuteAdvisory(exec, result, next, makeContext = defaultMessageContext) {
  const decision = await next();
  // A blocked or cancelled call needs no advisory about content that was never
  // written. dsh's own post-execute listeners gate on `kind` the same way.
  if (decision?.kind && decision.kind !== 'accept') return decision;
  const warnings = postExecuteWarnings(exec);
  if (warnings.length === 0) return decision;
  const contexts = (await Promise.all(warnings.map((text) => makeContext(text)))).filter(Boolean);
  if (contexts.length === 0) return decision;
  return {
    ...decision,
    additionalContexts: [...(decision?.additionalContexts ?? []), ...contexts],
  };
}

// ---------------------------------------------------------------------------

/**
 * Wait for the tool registry before activating.
 *
 * Without this, `apply` runs immediately and touches `ctx.tools.guard(...)` --
 * if the registry service is not mounted yet, `ctx.tools` is undefined and the
 * whole plugin throws instead of registering. Declaring the dependency makes the
 * loader activate us only once `tools` is available (and deactivate us if it ever
 * goes away), which is the documented way to depend on a service.
 */
export const inject = ['tools'];

const GUARDS = [guardRawData, guardFabricated, guardOffbook];

/**
 * Register the three monotonic guards. Each `ctx.tools.guard()` call returns its
 * own disposer; returning one cleanup from `apply` is the standard Cordis
 * dispose contract.
 */
export function apply(ctx) {
  const disposers = GUARDS.map((guard) => ctx.tools.guard(guard));

  // The advisories never own the decision: await the downstream one and spread it,
  // adding context only. Returning `next()`'s value unchanged when there is nothing
  // to say keeps this listener invisible to every other plugin in the chain.
  const offPostExecute = ctx.on('tools/post-execute', postExecuteAdvisory);
  if (typeof offPostExecute === 'function') disposers.push(offPostExecute);

  return () => {
    for (const dispose of disposers) if (typeof dispose === 'function') dispose();
  };
}

// Exported for the port's own test matrix. The loader looks for `apply`, so these
// extra names are inert; they exist so the guard logic can be exercised directly
// instead of only through an installed bundle.
export {
  guardRawData,
  guardFabricated,
  guardOffbook,
  fabricatedTell,
  scratchRunRequested,
  checkDeckFromPipeline,
  checkStaleCanon,
  postExecuteWarnings,
  postExecuteAdvisory,
  findRoot,
  wiredBasenames,
  wiredSourceBlob,
  stems,
  isExhibitRef,
  expandPaths,
};
