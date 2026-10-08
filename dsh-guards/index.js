/**
 * DSH wiring for the mixtape_harness guardrails.
 *
 * All of the logic lives in `checks.js`, which carries no dsh imports and is
 * therefore exercisable by a bare `node dsh-guards/test.mjs`. This module is the
 * thin part that needs a harness: it registers the three guards and the
 * post-execute advisory listener, and it builds the context message.
 *
 * `createUserMessage` is imported STATICALLY, deliberately. It ships with dsh, so
 * the bundle declares no dependency on it, and the loader that mounts the bundle
 * resolves it. An earlier version imported it lazily so that this file could also
 * be imported by a bare `node` run; that was a mistake. Node resolves a dynamic
 * import from this file's own location, where dsh's packages are NOT on the
 * module path -- the import failed, the message factory returned nothing, and
 * every advisory was dropped SILENTLY. Which is the exact failure mode these
 * guardrails exist to prevent.
 *
 * A static import is resolved by the loader, and if it ever fails it fails loudly
 * at activation instead of quietly at runtime.
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import {
  guardRawData,
  guardFabricated,
  guardOffbook,
  postExecuteAdvisory,
} from './checks.js';

/**
 * Wait for the tool registry before activating.
 *
 * Without this, `apply` runs immediately and touches `ctx.tools.guard(...)`; if
 * the registry service is not mounted yet, `ctx.tools` is undefined and the whole
 * plugin throws instead of registering anything. Declaring the dependency makes
 * the loader activate us only once `tools` is available -- the documented way to
 * depend on a service.
 */
export const inject = ['tools'];

const GUARDS = [guardRawData, guardFabricated, guardOffbook];

/** One plugin-tagged user message carrying an advisory. */
function advisoryContext(text) {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'plugin' }, // a kind dsh itself uses for plugin-injected context
  });
}

/**
 * Register the three monotonic guards and the advisory listener. Each registration
 * returns its own disposer; returning one cleanup from `apply` is the standard
 * Cordis dispose contract.
 *
 * A guard registers after the `tools/pre-execute` waterfall, is synchronous, and
 * is monotonic -- a returned reason denies the call and no later listener can turn
 * that denial back into permission. An `accept` post-execute decision "keeps the
 * call successful" while its `additionalContexts` "are ferried on the returned
 * result", so an advisory's write stands and the warning rides along to the model.
 */
export function apply(ctx) {
  const disposers = GUARDS.map((guard) => ctx.tools.guard(guard));
  const offPostExecute = ctx.on('tools/post-execute', (exec, result, next) =>
    postExecuteAdvisory(exec, result, next, advisoryContext),
  );
  if (typeof offPostExecute === 'function') disposers.push(offPostExecute);
  return () => {
    for (const dispose of disposers) if (typeof dispose === 'function') dispose();
  };
}
