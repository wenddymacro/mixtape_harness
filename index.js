/**
 * mixtape_harness -> DSH: put this checkout's `skills/` in every session's catalog.
 *
 * WHY THIS IS JAVASCRIPT AND NOT A YAML ROW
 * -----------------------------------------
 * DSH's local skill provider takes `customSkillDirs`, and it runs each entry
 * through `path.resolve` before scanning (`@deepseek-ai/dsh-skill-filesystem`,
 * lib/index.js). So `~` is never expanded and a relative path depends on the
 * server's process cwd -- neither is usable in a checked-in file. The only path
 * that works in YAML is an absolute one, which is machine-specific by
 * definition: the first version of this bundle hardcoded a Windows path and
 * found nothing on macOS or Linux, silently.
 *
 * So this module computes the directory from its OWN location instead. A package
 * always knows where it is; `<this package>/skills` is correct for a local
 * symlinked install (the repo it was installed from) and for a packed install
 * (`files` in package.json ships `skills/`), on every OS, with no path to edit.
 *
 * WHY IT MOUNTS THE SHIPPED PROVIDER RATHER THAN REGISTERING ITS OWN
 * ------------------------------------------------------------------
 * `ctx.loader.import()` resolves a plugin specifier the same way a YAML row's
 * `name` is resolved -- through DSH's own module loader -- so this bundle can
 * mount the provider DSH already ships, at whatever version ships with it, and
 * inherit its frontmatter parsing, its watcher, and its symlink handling. A
 * bespoke provider would mean re-implementing YAML frontmatter (these SKILL.md
 * files use `|` and `>-` block scalars) in a project whose entire premise is
 * that unverified re-implementations are where errors hide.
 *
 * A bare `import '@deepseek-ai/dsh-skill-filesystem'` would NOT work: a bundle
 * package's own `node_modules` is empty, so the specifier fails to LINK and the
 * module never runs at all (this is the failure mode documented in
 * ../dsh-guards/README.md). `ctx.loader.import` is the supported detour.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Row/plugin name, for logs and loader entries. */
export const name = 'mixtape-harness-skills'

/**
 * The loader service for `ctx.loader.import`, and the skill registry because
 * the provider we mount registers itself on `ctx.skills`.
 */
export const inject = ['loader', 'skills']

/** DSH's local filesystem skill provider -- shipped with the harness. */
const PROVIDER = '@deepseek-ai/dsh-skill-filesystem'

/**
 * The `skills/` directory that sits beside the module at `from`.
 *
 * @param from - a `file:` module URL; defaults to this module.
 * @returns the absolute path to `skills/`.
 * @throws when it is missing -- a bundle that finds no skills must say so, not
 *   scan nothing and look healthy (skill discovery failures are otherwise
 *   silent, and the model cannot tell "absent" from "invalid").
 */
export function skillsDir(from = import.meta.url) {
  const dir = join(dirname(fileURLToPath(from)), 'skills')
  if (!existsSync(dir)) {
    throw new Error(
      `mixtape-harness: expected a skills/ directory beside ${fileURLToPath(from)}; ` +
        `found nothing at ${dir}. The bundle is installed from a directory that is ` +
        `not this harness checkout -- install it from the checkout root.`,
    )
  }
  return dir
}

/**
 * Mount the shipped local skill provider on this checkout's `skills/`.
 *
 * @param ctx - the plugin context, with `loader` and `skills` injected.
 */
export async function apply(ctx) {
  const dir = skillsDir()

  let module
  try {
    module = await ctx.loader.import(PROVIDER)
  } catch (error) {
    throw new Error(
      `mixtape-harness: ${PROVIDER} is part of DSH but this build would not resolve it ` +
        `from the loader: ${error}`,
    )
  }

  // The package exports a namespace ({ apply, inject, Config, ... }), which
  // cordis accepts as a plugin object; `.default` is the fallback for a build
  // that ever adds one.
  const plugin = typeof module?.apply === 'function' ? module : module?.default
  if (typeof plugin?.apply !== 'function') {
    throw new Error(
      `mixtape-harness: ${PROVIDER} did not resolve to a plugin (got ${typeof module}); ` +
        `refusing to activate with no skill provider mounted.`,
    )
  }

  // includeDefaultRoots:false keeps this provider isolated -- it scans ONLY the
  // directory above, so it cannot double-register the project/user/bundled roots
  // the preset's own provider already covers. providerName namespaces it, so it
  // cannot collide with that provider either.
  //
  // Do NOT return this fiber: cordis reads a plugin's returned value as an
  // effect, and a Fiber is not one -- it throws "Invalid effect". The child is
  // owned by this fiber's effect scope and is disposed with it.
  ctx.plugin(plugin, {
    providerName: 'mixtape-harness',
    includeDefaultRoots: false,
    customSkillDirs: [dir],
  })
}
