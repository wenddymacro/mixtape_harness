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
  apply,
  guardRawData,
  guardFabricated,
  guardOffbook,
  scratchRunRequested,
} from './index.js';

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

// ------------------------------------------------------- plugin shape
const registered = [];
const dispose = apply({ tools: { guard: (g) => (registered.push(g), () => {}) } });
expect('apply() registers three guards', registered.length, 3);
expect('apply() returns a disposer', typeof dispose, 'function');
expect('every registered guard is a function', registered.every((g) => typeof g === 'function'), true);
dispose();

fs.rmSync(ROOT, { recursive: true, force: true });

console.log(`${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
process.exit(failures.length ? 1 : 0);
