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
 * Register the three monotonic guards and the advisory listener.
 *
 * A guard registers after the `tools/pre-execute` waterfall, is synchronous, and
 * is monotonic -- a returned reason denies the call and no later listener can turn
 * that denial back into permission. Guards live in the registry's global layer, so
 * they apply to every agent without further work.
 *
 * The ADVISORY listener is a different matter, and is registered TWICE:
 *
 *   - on this plugin's own context, and
 *   - on each agent's context, from an `agent/created` listener.
 *
 * The waterfall is dispatched on a scope derived from the executing agent
 * (`scopeTarget(this, exec.agent)`), while a bundle plugin's context sits at the
 * profile root. dsh-scope documents that event admission "extends UP" a scope
 * chain, which would make the root an ancestor of every agent -- but dsh's
 * per-agent guidance is explicit that per-agent behavior belongs on `agent.ctx`,
 * obtained in an `agent/created` listener. Which one actually dispatches could not
 * be settled by reading the shipped code, so both are registered and a shared
 * WeakSet makes delivery exactly-once either way.
 *
 * Registering on the agent also closes a real gap rather than only hedging an
 * unknown: an agent that already exists when the plugin loads never fires
 * `agent/created`, and the context registration is what covers it.
 *
 * Once the dispatch path is confirmed, the redundant registration can be dropped.
 */
export function apply(ctx) {
  const disposers = GUARDS.map((guard) => ctx.tools.guard(guard));
  const advised = new WeakSet();
  const perAgent = new Map();

  const listener = (exec, result, next) =>
    postExecuteAdvisory(exec, result, next, advisoryContext, advised);

  const offOwnContext = ctx.on('tools/post-execute', listener);
  if (typeof offOwnContext === 'function') disposers.push(offOwnContext);

  const offCreated = ctx.on('agent/created', ({ agent }) => {
    if (!agent?.ctx || perAgent.has(agent)) return;
    const dispose = agent.ctx.on('tools/post-execute', listener);
    if (typeof dispose === 'function') perAgent.set(agent, dispose);
  });
  const offDisposed = ctx.on('agent/disposed', ({ agent }) => {
    const dispose = perAgent.get(agent);
    if (typeof dispose === 'function') dispose();
    perAgent.delete(agent);
  });
  if (typeof offCreated === 'function') disposers.push(offCreated);
  if (typeof offDisposed === 'function') disposers.push(offDisposed);

  return () => {
    for (const dispose of disposers) if (typeof dispose === 'function') dispose();
    for (const dispose of perAgent.values()) if (typeof dispose === 'function') dispose();
    perAgent.clear();
  };
}
