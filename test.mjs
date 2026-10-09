// Test matrix for the DSH bundle at this repository root. No dependencies and no
// DSH installation: everything it checks is plain node, so `node test.mjs` runs
// anywhere -- which is the point, since the claim under test is that this bundle
// works on Windows, macOS, and Linux alike.
//
// Exits non-zero on the first failing expectation set.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply, inject, name, skillsDir } from './index.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const SKILLS = path.join(ROOT, 'skills')

let pass = 0
const failures = []

function check(label, actual, wanted) {
  if (actual === wanted) pass++
  else failures.push(`${label}\n      expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`)
}

function ok(label, value, wanted = true) {
  check(label, Boolean(value), wanted)
}

function throws(label, fn, includes) {
  try {
    fn()
  } catch (error) {
    const message = String(error?.message ?? error)
    if (includes !== undefined && !message.includes(includes)) {
      failures.push(`${label}\n      threw, but the message does not mention ${JSON.stringify(includes)}:\n      ${message}`)
    } else pass++
    return
  }
  failures.push(`${label}\n      expected a throw, nothing was thrown`)
}

async function rejects(label, promise, includes) {
  try {
    await promise
  } catch (error) {
    const message = String(error?.message ?? error)
    if (includes !== undefined && !message.includes(includes)) {
      failures.push(`${label}\n      rejected, but the message does not mention ${JSON.stringify(includes)}:\n      ${message}`)
    } else pass++
    return
  }
  failures.push(`${label}\n      expected a rejection, it resolved`)
}

// ------------------------------------------------------- the plugin's shape
console.log('plugin shape')
ok("inject declares the loader service (ctx.loader.import)", inject.includes('loader'))
ok('inject declares the skills registry (the provider mounts onto it)', inject.includes('skills'))
check('name is stable', name, 'mixtape-harness-skills')

const indexSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8')
// The invariant that actually broke in dsh-guards: a bare specifier fails to LINK
// at activation, so the module never executes and every registration silently
// disappears. `@deepseek-ai/dsh-skill-filesystem` is reached through the loader,
// never through a bare import.
const bareImports = [...indexSrc.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gms)]
  .map((match) => match[1])
  .filter((spec) => !spec.startsWith('./') && !spec.startsWith('node:'))
check('index.js imports nothing outside ./ and node: builtins', bareImports.join(', '), '')
ok('the provider is reached through ctx.loader.import', /ctx\.loader\.import\(PROVIDER\)/.test(indexSrc))
ok('apply is async (it awaits the loader)', /export async function apply\(/.test(indexSrc))
// cordis reads a plugin's returned value as an effect; returning the child fiber
// throws "Invalid effect" and takes the whole bundle down at activation.
ok('apply does not return the fiber it mounts', !/return ctx\.plugin\(/.test(indexSrc))

// --------------------------------------------------- self-location, no paths
console.log('self-location')
check('skills/ is found beside index.js', skillsDir(), SKILLS)
ok('that directory exists', fs.existsSync(SKILLS))
throws(
  'a module with no skills/ beside it throws, naming the path',
  () => skillsDir('file:///no/such/place/index.js'),
  'skills',
)
// This is the bug the JavaScript rewrite exists to prevent: a drive letter, a
// '/Users/', a '/home/', a 'C:/' -- any absolute path in the row is a path that
// is wrong on the other two operating systems.
const patch = fs.readFileSync(path.join(ROOT, 'cordis.patch.yml'), 'utf8')
const patchBody = patch
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n')
// A quoted string that is a filesystem path: POSIX-absolute, home-relative, a
// drive letter, or containing a backslash. A scoped package name
// ('@local/mixtape-harness') is not a path and must not trip this.
const quotedPaths = [...patchBody.matchAll(/'([^']*)'/g)]
  .map((match) => match[1])
  .filter((value) => /^[/~]/.test(value) || /^[A-Za-z]:/.test(value) || value.includes('\\'))
check('cordis.patch.yml carries no path in a quoted value', quotedPaths.join(', '), '')
ok('...and no drive letter', !/[A-Za-z]:[\\/]/.test(patchBody))
ok('...and no users home directory', !/[/\\](Users|home)[/\\]/.test(patchBody))
ok('the row names this package', /name:\s*'@local\/mixtape-harness'/.test(patchBody))

// ------------------------------------------------------------ activation
console.log('activation')
const providerModule = { apply() {}, inject: ['skills'], name: 'skill-filesystem' }

function fakeContext(module, { reject = false } = {}) {
  const mounted = []
  const imported = []
  return {
    mounted,
    imported,
    loader: {
      import: async (spec) => {
        imported.push(spec)
        if (reject) throw new Error('ERR_MODULE_NOT_FOUND')
        return module
      },
    },
    plugin: (plugin, config) => {
      mounted.push({ plugin, config })
      return { fake: 'fiber' }
    },
  }
}

const ctx = fakeContext(providerModule)
const returned = await apply(ctx)
check('apply mounts exactly one plugin', ctx.mounted.length, 1)
check('...the shipped filesystem provider', ctx.mounted[0]?.plugin, providerModule)
check('...resolved through the loader by name', ctx.imported[0], '@deepseek-ai/dsh-skill-filesystem')
check('apply returns undefined, not the fiber', returned, undefined)

const config = ctx.mounted[0]?.config
check('the provider scans only our directory', JSON.stringify(config?.customSkillDirs), JSON.stringify([SKILLS]))
check('the provider is isolated from project/user roots', config?.includeDefaultRoots, false)
check('the provider is namespaced, so it cannot collide with the preset provider', config?.providerName, 'mixtape-harness')

const defaulted = fakeContext({ default: providerModule })
await apply(defaulted)
check('a module with a default export is also accepted', defaulted.mounted.length, 1)

await rejects('an unresolvable provider fails loudly, not silently', apply(fakeContext(null, { reject: true })), 'would not resolve')
await rejects('a module that is not a plugin fails loudly', apply(fakeContext({})), 'did not resolve to a plugin')

// ------------------------------------------------- the skills are loadable
console.log('the skills DSH will actually read')
const dirs = fs
  .readdirSync(SKILLS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

ok(`skills/ holds at least 15 skill directories (found ${dirs.length})`, dirs.length >= 15)

const expected = ['amnesia', 'beautiful-deck', 'bibcheck', 'blindspot', 'covariates', 'drift-sweep', 'newproject', 'pipeline', 'referee2']
for (const skill of expected) ok(`skills/${skill}/SKILL.md exists`, fs.existsSync(path.join(SKILLS, skill, 'SKILL.md')))

// The provider DROPS a skill whose frontmatter is invalid, and the model cannot
// tell a dropped skill from an absent one -- so this is checked here, where a
// failure is visible, rather than discovered as a missing slash-command.
for (const skill of dirs) {
  const file = path.join(SKILLS, skill, 'SKILL.md')
  if (!fs.existsSync(file)) {
    failures.push(`skills/${skill}/SKILL.md\n      missing (the provider only discovers <name>/SKILL.md)`)
    continue
  }
  const body = fs.readFileSync(file, 'utf8')
  const block = body.startsWith('---') ? body.slice(3, body.indexOf('\n---', 3)) : undefined
  if (block === undefined) {
    failures.push(`skills/${skill}/SKILL.md\n      does not open with a YAML frontmatter block`)
    continue
  }
  const declared = block.match(/^name:\s*(\S+)/m)
  check(`skills/${skill}/SKILL.md declares name: ${skill}`, declared?.[1], skill)
  const description = block.match(/^description:\s*(.*)$/m)
  ok(`skills/${skill}/SKILL.md declares a description`, (description?.[1] ?? '').trim().length > 2 || /\n\s+\S/.test(block.slice(block.indexOf('description:'))))
}

// --------------------------------------------------------- the package itself
console.log('the package manifest')
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
check('package.json declares a bundle patch', manifest?.dsh?.bundle?.patch, './cordis.patch.yml')
ok('that patch file exists', fs.existsSync(path.join(ROOT, 'cordis.patch.yml')))
ok('the packed bundle ships skills/ (a git install would otherwise have none)', manifest.files?.includes('skills'))
ok('the packed bundle ships index.js', manifest.files?.includes('index.js'))
ok('the packed bundle ships the patch it is loaded from', manifest.files?.includes('cordis.patch.yml'))

// --------------------------------------------------------------- the client half
// The host composes a client bundle from `dsh.client` + exports["./client"] and
// then RUNS it in the page. So this section does not grep the file -- it executes
// it against a fake `window.__ModuleLoader__` and drives `apply`.
//
// That distinction is not academic. The first version of lib/client.js said
// `_ModuleLoader__` (one underscore) instead of `window.__ModuleLoader__`, and it
// crashed the entire web boot with "ReferenceError: _ModuleLoader__ is not
// defined" plus a modal the user could not get past. A regex test agreed with the
// typo. Only evaluating the file catches that class of mistake.
console.log('the client half')
ok('package.json declares dsh.client', manifest?.dsh?.client !== undefined)
check('...for the web platform', manifest?.dsh?.client?.platform, 'web')
ok('...naming the sidebar service it needs',
   (manifest?.dsh?.client?.inject ?? []).includes('@deepseek-ai/dsh-client-ui-sidebar-right'))

const clientExport = manifest?.exports?.['./client']
const clientRel = typeof clientExport === 'string' ? clientExport : clientExport?.default
ok('exports["./client"] is a string or a one-level {default} object',
   typeof clientRel === 'string' && clientRel.length > 0)
const clientPath = path.join(ROOT, clientRel ?? '')
ok(`the built bundle exists at ${clientRel} (the host serves built bundles only)`,
   fs.existsSync(clientPath))

if (fs.existsSync(clientPath)) {
  const vm = await import('node:vm')
  const src = fs.readFileSync(clientPath, 'utf8')

  const registrations = []
  const store = new Map()
  const sandbox = {
    console, URL, setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval: () => {},
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    },
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, instance: sandbox.__instance }) }),
    window: { __ModuleLoader__: { load: registration => registrations.push(registration) } },
    __instance: 'instance-1',
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)

  let loadError = null
  try { vm.runInContext(src, sandbox, { filename: clientRel }) } catch (error) { loadError = error }
  check('it evaluates in a page context, finding the registration sink',
        loadError === null ? 'ok' : String(loadError?.message ?? loadError), 'ok')
  check('it registers exactly one entry', registrations.length, 1)

  const registration = registrations[0]
  check('the registered id is the package name', registration?.id, manifest.name)

  let mod = null
  let factoryError = null
  try { mod = registration.factory(() => { throw new Error('unexpected external request') }) }
  catch (error) { factoryError = error }
  check('the factory returns the module object', factoryError === null ? 'ok' : String(factoryError?.message ?? factoryError), 'ok')
  ok('the module declares inject', Array.isArray(mod?.inject))
  ok('it injects sidebarRight, the service it calls', (mod?.inject ?? []).includes('sidebarRight'))
  check('the module exposes apply', typeof mod?.apply, 'function')

  if (typeof mod?.apply === 'function') {
    const opened = []
    const ctx = {
      effect: run => { run() },
      sidebarRight: { openTab: (kind, options) => opened.push({ kind, options }) },
    }
    let applyError = null
    try { mod.apply(ctx) } catch (error) { applyError = error }
    check('apply does not throw (nothing here may break the boot)',
          applyError === null ? 'ok' : String(applyError?.message ?? applyError), 'ok')

    await new Promise(resolve => setTimeout(resolve, 25))
    check('a healthy dashboard opens the Browser tab', opened[0]?.kind, 'browser')
    check('...at the dashboard URL', opened[0]?.options?.params?.url, 'http://localhost:8080/')

    opened.length = 0
    mod.apply(ctx)
    await new Promise(resolve => setTimeout(resolve, 25))
    check('the SAME dashboard instance does not open a second tab on reload', opened.length, 0)

    sandbox.__instance = 'instance-2'
    opened.length = 0
    mod.apply(ctx)
    await new Promise(resolve => setTimeout(resolve, 25))
    check('a NEWLY activated dashboard opens exactly one tab', opened.length, 1)
  }

  ok('the packed bundle ships the built client half', manifest.files?.includes('lib/client.js'))
}

// ------------------------------------------------------------ the bilingual pairs
// Two documents that are supposed to say the same thing WILL drift apart, and
// only a machine notices -- which is the whole thesis of this harness, applied to
// its own front door. DSH records an en/zh hash per section for exactly this
// (README.i18n.yaml, `pnpm run verify-translation-pairing`); this is the
// dependency-free version: same shape, same numbers, a link each way.
//
// Two blind spots in the first version of this check, both fixed here, both
// instructive:
//   * it only knew about README, so a whole second pair could drift unchecked;
//   * its fence regex was /^```/, which does not match a block INDENTED inside a
//     numbered list -- and the guide indents most of its blocks. A count that
//     silently ignores half the document is worse than no count.
console.log('the bilingual doc pairs')
const DOC_PAIRS = [['README.md', 'README.zh.md'], ['GUIDE.md', 'GUIDE.zh.md']]
const countOf = (text, re) => (text.match(re) ?? []).length
const escapeRe = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

for (const [enName, zhName] of DOC_PAIRS) {
  const enPath = path.join(ROOT, enName)
  const zhPath = path.join(ROOT, zhName)
  ok(`${enName} exists`, fs.existsSync(enPath))
  ok(`${zhName} exists`, fs.existsSync(zhPath))
  if (!fs.existsSync(enPath) || !fs.existsSync(zhPath)) continue

  const en = fs.readFileSync(enPath, 'utf8')
  const zh = fs.readFileSync(zhPath, 'utf8')

  ok(`${enName} links to ${zhName}`, new RegExp(`\\[中文\\]\\(${escapeRe(zhName)}\\)`).test(en))
  ok(`${zhName} links back to ${enName}`, new RegExp(`\\[English\\]\\(${escapeRe(enName)}\\)`).test(zh))

  check(`${enName}/${zhName}: same number of ## sections`,
        countOf(zh, /^## /gm), countOf(en, /^## /gm))
  check(`${enName}/${zhName}: same number of ### sections`,
        countOf(zh, /^### /gm), countOf(en, /^### /gm))
  check(`${enName}/${zhName}: same number of fenced code blocks (indented ones included)`,
        countOf(zh, /^\s*```/gm), countOf(en, /^\s*```/gm))
  check(`${enName}/${zhName}: same number of table rows`,
        countOf(zh, /^\s*\|/gm), countOf(en, /^\s*\|/gm))
}

// The numbers a reader is asked to believe must be on BOTH sides of the README.
// A revision that updates one language and not the other is the drift this catches.
{
  const en = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
  const zh = fs.readFileSync(path.join(ROOT, 'README.zh.md'), 'utf8')
  for (const figure of ['82,140', '5,476', '+0.2098', '0.684', '159']) {
    ok(`both READMEs state ${figure}`, en.includes(figure) && zh.includes(figure))
  }
}

console.log(`\n${pass} passed, ${failures.length} failed`)
for (const failure of failures) console.log(`  FAIL  ${failure}`)
process.exit(failures.length ? 1 : 0)
