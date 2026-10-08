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
 *
 * `node:fs` is imported directly, deliberately. A guard must be synchronous, and
 * the `ctx.fs` service is asynchronous, so the synchronous fs calls existSync /
 * realpathSync / readFileSync are the only ones usable here.
 */
import fs from 'node:fs';
import path from 'node:path';

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

const GUARDS = [guardRawData, guardFabricated, guardOffbook];

/**
 * Register the three monotonic guards. Each `ctx.tools.guard()` call returns its
 * own disposer; returning one cleanup from `apply` is the standard Cordis
 * dispose contract.
 */
export function apply(ctx) {
  const disposers = GUARDS.map((guard) => ctx.tools.guard(guard));
  return () => {
    for (const dispose of disposers) if (typeof dispose === 'function') dispose();
  };
}

// Exported for the port's own test matrix. The loader looks for `apply`, so
// these extra names are inert; they exist so the guard logic can be exercised
// directly instead of only through an installed bundle.
export { guardRawData, guardFabricated, guardOffbook, fabricatedTell, scratchRunRequested };
