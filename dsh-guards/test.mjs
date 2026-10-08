// Test matrix for the ported guardrails. No dependencies, no fixtures checked
// in: everything is created under the OS temp directory and removed at the end.
//
//   node test.mjs
//
// Exits non-zero on the first failing expectation set.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  guardRawData,
  guardFabricated,
  guardOffbook,
  scratchRunRequested,
  checkDeckFromPipeline,
  checkStaleCanon,
  postExecuteWarnings,
  postExecuteAdvisory,
  findRoot,
  stems,
  isExhibitRef,
  expandPaths,
} from './checks.js';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mixtape-guards-'));
const RAW = path.join(ROOT, 'data', 'raw', 'brazil.csv');
const DERIVED = path.join(ROOT, 'data', 'derived', 'panel.csv');

fs.mkdirSync(path.dirname(RAW), { recursive: true });
fs.mkdirSync(path.dirname(DERIVED), { recursive: true });
fs.writeFileSync(RAW, 'a,b\n1,2\n');
fs.writeFileSync(DERIVED, 'a,b\n1,2\n');

let pass = 0;
const failures = [];

function check(label, verdict, expectBlocked) {
  const blocked = typeof verdict === 'string' && verdict.length > 0;
  if (blocked === expectBlocked) pass++;
  else
    failures.push(
      `${label}\n      expected ${expectBlocked ? 'BLOCK' : 'allow'}, got ${blocked ? 'BLOCK' : 'allow'}`,
    );
}

function expect(label, actual, wanted) {
  if (actual === wanted) pass++;
  else failures.push(`${label}\n      expected ${wanted}, got ${actual}`);
}

const write = (file_path, extra) => ({ name: 'write', arguments: { file_path, ...extra } });
const edit = (file_path, new_string) => ({ name: 'edit', arguments: { file_path, new_string } });
const shell = (command, extra) => ({ name: 'pwsh', arguments: { command, ...extra } });

// ------------------------------------------------------------- raw data
check('write to an existing data/raw file', guardRawData(write(RAW, { content: 'x' })), true);
check('write a NEW file into data/raw', guardRawData(write(path.join(ROOT, 'data', 'raw', 'new.csv'), { content: 'x' })), false);
check('write to data/derived', guardRawData(write(DERIVED, { content: 'x' })), false);
check('edit an existing data/raw file', guardRawData(edit(RAW, 'y')), true);
check('the read tool is not a write', guardRawData({ name: 'read', arguments: { file_path: RAW } }), false);
check('a shell tool is not a file write', guardRawData(shell('echo hi')), false);
check('DATA/RAW matches case-insensitively', (() => {
  const upper = path.join(ROOT, 'DATA', 'RAW', 'brazil.csv');
  fs.mkdirSync(path.dirname(upper), { recursive: true });
  fs.writeFileSync(upper, 'a\n');
  return guardRawData(write(upper, { content: 'x' }));
})(), true);

// ------------------------------------------------- fabricated exhibits
const FAKE_WITH_RNG =
  'import numpy as np\nx = np.random.normal(size=100)\nggsave("output/figures/fake.pdf")\n# fake data\n';
const FAKE_NO_RNG =
  'x = [1, 2, 3]\nggsave("output/figures/hardcoded.pdf")\n# fake data\n';
const MC_LABELLED =
  '# MONTE CARLO\nimport numpy as np\nx = np.random.normal(size=100)\nggsave("output/figures/sim.pdf")\n# fake data\n';
const SYNTH_CONTROL =
  'library(tidysynth)\n# synthetic control weights\nggsave("output/figures/synth.pdf")\n';

check('a fabricating .py with an RNG', guardFabricated(write('code/make_fig.py', { content: FAKE_WITH_RNG })), true);
check('same file without an RNG (documented residual)', guardFabricated(write('code/make_fig.py', { content: FAKE_NO_RNG })), false);
check('a labelled Monte Carlo is exempt', guardFabricated(write('code/make_fig.py', { content: MC_LABELLED })), false);
check('no exhibit-producing signal at all', guardFabricated(write('code/util.py', { content: 'x = np.random.normal(size=3)\n' })), false);
check('a sim-named file is exempt (MC_NAME_RE)', guardFabricated(write('code/run_sim.py', { content: FAKE_WITH_RNG })), false);
check('legitimate synthetic-control vocabulary is scrubbed', guardFabricated(write('code/synth.R', { content: SYNTH_CONTROL })), false);
check('a non-script extension is ignored', guardFabricated(write('notes.md', { content: FAKE_WITH_RNG })), false);
check('a relative hooks/ path is skipped', guardFabricated(write('hooks/evil.py', { content: FAKE_WITH_RNG })), false);
check('an absolute hooks/ path is skipped', guardFabricated(write('C:/repo/hooks/evil.py', { content: FAKE_WITH_RNG })), false);
check('a real code/ path is still scanned', guardFabricated(write('code/make_fig.py', { content: FAKE_WITH_RNG })), true);

const evilScript = path.join(ROOT, 'evil_producer.py');
fs.writeFileSync(evilScript, FAKE_WITH_RNG);
check('a shell command running a fabricating script', guardFabricated(shell(`python ${evilScript}`)), true);
check('a shell command running something clean', guardFabricated(shell('python -c "print(1)"')), false);

// --------------------------------------------------- off-book exhibits
check('inline python that plots', guardOffbook(shell('python3 -c "import matplotlib; savefig(1)"')), true);
check('inline R that plots', guardOffbook(shell('Rscript -e \'ggsave("x.png")\'')), true);
check('inline code that does not plot', guardOffbook(shell('python3 -c "print(1)"')), false);
check('a named script is not inline', guardOffbook(shell('python3 code/make_fig.py')), false);
check('pdflatex is untouched', guardOffbook(shell('pdflatex deck.tex')), false);
check('the SCRATCH_RUN prefix is honoured', guardOffbook(shell('SCRATCH_RUN=1 python3 -c "savefig(1)"')), false);
check('leading env assignments before SCRATCH_RUN', guardOffbook(shell('FOO=bar SCRATCH_RUN=1 python3 -c "savefig(1)"')), false);
check('a non-shell tool is ignored', guardOffbook(write('code/x.py', { content: 'x' })), false);

expect('a bare SCRATCH_RUN prefix is honoured', scratchRunRequested('SCRATCH_RUN=1 python3 -c "x"'), true);
expect('a mid-command SCRATCH_RUN is ignored', scratchRunRequested('echo hi && SCRATCH_RUN=1 python3 -c "x"'), false);
expect('an inherited env var is honoured', (() => {
  process.env.SCRATCH_RUN = '1';
  const r = scratchRunRequested('python3 -c "x"');
  delete process.env.SCRATCH_RUN;
  return r;
})(), true);

// [G] dsh's shell is pwsh on Windows, where the POSIX form is not a command.
expect('[G] the PowerShell spelling is honoured',
  scratchRunRequested('$env:SCRATCH_RUN=1; python -c "x"'), true);
expect('[G] a spaced PowerShell assignment is honoured',
  scratchRunRequested("$env:SCRATCH_RUN = '1'; python -c \"x\""), true);
expect('[G] a plain PowerShell variable is NOT the env var',
  scratchRunRequested('$SCRATCH_RUN=1; python -c "x"'), false);
check('[G] the off-book guard passes a PowerShell-prefixed plot',
  guardOffbook(shell('$env:SCRATCH_RUN=1; python -c "savefig(1)"')), false);
check('[G] ...and still blocks the same command without it',
  guardOffbook(shell('python -c "savefig(1)"')), true);

// ------------------------------------------- post-execution advisories
// A miniature project: a runner that wires two scripts, a deck, and a stage
// canister. `findRoot` anchors on the written file's own directory, so the deck
// and the canister both resolve ROOT as their project.
console.log('post-execution advisories (deck-from-pipeline, no-stale-canon)');
const PROJ = path.join(ROOT, 'proj');
const runner = path.join(PROJ, 'code', 'run_pipeline.sh');
const figsDir = path.join(PROJ, 'output', 'figures');
fs.mkdirSync(path.dirname(runner), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'decks'), { recursive: true });
fs.mkdirSync(figsDir, { recursive: true });
fs.mkdirSync(path.join(PROJ, 'analyses', 'x', 'stages', '00_packages'), { recursive: true });

fs.writeFileSync(runner, 'python3 code/make_figs.py\nRscript code/tables.R\n# python3 code/commented_out.py\n');
fs.writeFileSync(path.join(PROJ, 'code', 'make_figs.py'), 'ggsave("output/figures/proj_outcome_permonth_53053.png")\n');
fs.writeFileSync(path.join(PROJ, 'code', 'tables.R'), 'texreg(m)\n');

const DECK = path.join(PROJ, 'decks', 'probe.html');
const WIRED_FIG = 'output/figures/proj_outcome_permonth_53053.png';
const UNWIRED_FIG = 'output/figures/never_made_thing.png';
fs.writeFileSync(DECK, `<img src="${WIRED_FIG}"><img src="assets/logo.png">`);
fs.writeFileSync(path.join(figsDir, 'proj_outcome_permonth_53053.png'), 'png');

check('deck: wired figure + a skipped asset', checkDeckFromPipeline(write(DECK, { content: 'x' })), false);
fs.writeFileSync(DECK, `<img src="${UNWIRED_FIG}">`);
check('deck: an exhibit no script produces', checkDeckFromPipeline(write(DECK, { content: 'x' })), true);
check('deck: a non-deck file is ignored', checkDeckFromPipeline(write(path.join(PROJ, 'notes.md'), { content: 'x' })), false);
fs.writeFileSync(DECK, `<img src="${WIRED_FIG}">`);
check('deck: an edit is treated like a write', checkDeckFromPipeline(edit(DECK, 'x')), false);

const ORPHAN_DECK = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'no-runner-')), 'd.html');
fs.writeFileSync(ORPHAN_DECK, `<img src="${UNWIRED_FIG}">`);
check('deck: no runner up-tree is a no-op', checkDeckFromPipeline(write(ORPHAN_DECK, { content: 'x' })), false);

const EXH = path.join(PROJ, 'analyses', 'x', 'stages', '00_packages', 'exhibits.md');
const realFig = path.join(figsDir, 'proj_outcome_permonth_53053.png');
const realScript = path.join(PROJ, 'code', 'make_figs.py');
const setExh = (body) => fs.writeFileSync(EXH, body);

setExh('# exhibits\n- entry with no canon marker\n');
check('canon: no CANON marker is a no-op', checkStaleCanon(write(EXH, { content: 'x' })), false);

// fresh: figure newer than its script, script wired
fs.utimesSync(realScript, new Date('2020-01-01'), new Date('2020-01-01'));
fs.utimesSync(realFig, new Date('2024-01-01'), new Date('2024-01-01'));
setExh(`# exhibits\n## CANON (2026-10-08)\n- \`${WIRED_FIG}\` — src: code/make_figs.py\n`);
check('canon: wired and fresh', checkStaleCanon(write(EXH, { content: 'x' })), false);

setExh(`# exhibits\n## CANON (2026-10-08)\n- \`${UNWIRED_FIG}\` — src: code/make_figs.py\n`);
expect('canon: MISSING file is reported as MISSING',
  (checkStaleCanon(write(EXH, { content: 'x' })) ?? '').includes('MISSING'), true);

fs.writeFileSync(path.join(figsDir, 'stray_thing.png'), 'png');
setExh(`# exhibits\n## CANON (2026-10-08)\n- \`output/figures/stray_thing.png\` — src: code/not_wired.py\n`);
expect('canon: an unwired producer is reported as UNWIRED',
  (checkStaleCanon(write(EXH, { content: 'x' })) ?? '').includes('UNWIRED'), true);

fs.utimesSync(realFig, new Date('2020-01-01'), new Date('2020-01-01'));
fs.utimesSync(realScript, new Date('2024-01-01'), new Date('2024-01-01'));
setExh(`# exhibits\n## CANON (2026-10-08)\n- \`${WIRED_FIG}\` — src: code/make_figs.py\n`);
expect('canon: a figure older than its script is reported as STALE',
  (checkStaleCanon(write(EXH, { content: 'x' })) ?? '').includes('STALE'), true);

// [F] a hyphenated producer name used to make the whole entry invisible
setExh(`# exhibits\n## CANON (2026-10-08)\n- \`output/figures/ghost.png\` — src: code/03-my-figure.py\n`);
const hyphenVerdict = checkStaleCanon(write(EXH, { content: 'x' }));
expect('[F] a hyphenated producer is now seen at all',
  typeof hyphenVerdict === 'string' && hyphenVerdict.length > 0, true);
expect('[F] ...and is reported as MISSING', (hyphenVerdict ?? '').includes('MISSING'), true);

check('canon: a non-exhibits.md file is ignored', checkStaleCanon(write(path.join(PROJ, 'notes.md'), { content: 'CANON (' })), false);

console.log('helpers');
expect('stems yields the 3-token prefix', stems('proj_outcome_permonth_53053.png').includes('proj_outcome_permonth'), true);
expect('stems yields only itself for two tokens', stems('final_tbl.png').join('|'), 'final_tbl');
expect('isExhibitRef accepts an exhibit dir', isExhibitRef('output/figures/a.png'), true);
expect('isExhibitRef rejects a logo', isExhibitRef('assets/logo/thing.png'), false);
expect('[C] isExhibitRef accepts a backslash path', isExhibitRef('output\\figures\\a.png'), true);
expect('expandPaths splits the /. shorthand', expandPaths('a/b/n.png/.pdf').join('|'), 'a/b/n.png|a/b/n.pdf');
expect('findRoot finds the runner', findRoot(DECK), PROJ);
expect('findRoot returns null with no runner', findRoot(ORPHAN_DECK), null);

// ------------------------------------------------------- wiring smoke test
// index.js cannot be imported here: it statically imports @deepseek-ai/dsh-llm,
// which only resolves inside a dsh installation. So its load-bearing lines are
// asserted textually, and checks.js is asserted to stay free of dsh imports --
// which is exactly what keeps this whole matrix runnable by a bare `node`.
const indexSrc = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const checksSrc = fs.readFileSync(new URL('./checks.js', import.meta.url), 'utf8');

expect("index.js declares inject = ['tools']", /export const inject = \['tools'\]/.test(indexSrc), true);
expect('index.js exports apply()', /export function apply\(ctx\)/.test(indexSrc), true);
expect('index.js imports createUserMessage statically',
  /^import \{ createUserMessage \} from '@deepseek-ai\/dsh-llm';$/m.test(indexSrc), true);
expect('index.js has NO lazy dynamic import', /await import\(/.test(indexSrc), false);
expect("index.js registers the post-execute listener",
  /ctx\.on\('tools\/post-execute'/.test(indexSrc), true);
expect('index.js registers all three guards',
  /GUARDS = \[guardRawData, guardFabricated, guardOffbook\]/.test(indexSrc), true);
expect('checks.js carries no dsh import', /@deepseek-ai/.test(checksSrc), false);

const stub = (text) => ({ role: 'user', content: [{ type: 'text', text }] });
const downstream = { kind: 'accept', content: [{ type: 'text', text: 'tool output' }] };
const nextFn = async () => downstream;

const unchanged = await postExecuteAdvisory(write(path.join(PROJ, 'notes.md'), { content: 'x' }), {}, nextFn, stub);
expect('advisory: nothing to say -> downstream decision returned unchanged', unchanged, downstream);

fs.writeFileSync(DECK, `<img src="${UNWIRED_FIG}">`);
const advised = await postExecuteAdvisory(write(DECK, { content: 'x' }), {}, nextFn, stub);
expect('advisory: downstream decision is preserved, not replaced', advised.kind, 'accept');
expect('advisory: downstream content survives', advised.content, downstream.content);
expect('advisory: exactly one context attached', advised.additionalContexts.length, 1);
expect('advisory: the context carries the warning', advised.additionalContexts[0].content[0].text.includes('deck-from-pipeline'), true);

expect('postExecuteWarnings exposes the message', postExecuteWarnings(write(DECK, { content: 'x' })).length, 1);

const blocked = { kind: 'block', feedback: [{ type: 'text', text: 'refused elsewhere' }] };
const stillBlocked = await postExecuteAdvisory(write(DECK, { content: 'x' }), {}, async () => blocked, stub);
expect('advisory: a blocked call is left untouched', stillBlocked, blocked);

fs.rmSync(ROOT, { recursive: true, force: true });

console.log(`${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
process.exit(failures.length ? 1 : 0);
