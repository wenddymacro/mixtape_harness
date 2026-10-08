/**
 * DSH wiring for the mixtape_harness guardrails.
 *
 * All of the logic lives in `checks.js`, which carries no dsh imports and is
 * therefore exercisable by a bare `node dsh-guards/test.mjs`. This module is the
 * thin part that needs a harness: it registers the three guards and the
 * post-execute advisory listener.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS NO BARE IMPORT HERE
 *
 * This file once did `import { createUserMessage } from '@deepseek-ai/dsh-llm'` on
 * the theory that a bundle may rely on packages shipped with dsh. It may not: the
 * plugin then failed to activate with its top-level code never having run -- a
 * LINK-time resolution failure, before a single statement -- and because the
 * failure is silent from the outside it cost five restarts to see.
 *
 * The message factory turned out to be unnecessary as well: the advisory is
 * delivered in the tool result, which is what the Python originals' stderr+exit 2
 * actually did. See the delivery note in checks.js.
 *
 * This module therefore imports nothing outside `./` and `node:` builtins, and a
 * test lists any bare specifier so one cannot creep back.
 * ---------------------------------------------------------------------------
 *
 * ONE RULE FOR THE LISTENER: the waterfall's `next` continuation is single-shot and
 * must be called exactly once per listener. An instrumented version once awaited it
 * for its own record and then let the check await it again; the second call
 * re-entered the chain and, because the OUTERMOST listener's return value is the
 * one the framework keeps, the decision that came back had lost the advisory. If
 * this file is ever instrumented again, wrap `next` -- never call it twice.
 */
import {
  guardRawData,
  guardFabricated,
  guardOffbook,
  postExecuteAdvisory,
} from './checks.js';

/**
 * Wait for the tool registry before activating.
 *
 * Without this, `apply` runs immediately and touches `ctx.tools.guard(...)`; if the
 * registry service is not mounted yet, `ctx.tools` is undefined and the whole plugin
 * throws instead of registering anything. Declaring the dependency makes the loader
 * activate us only once `tools` is available.
 */
export const inject = ['tools'];

const GUARDS = [guardRawData, guardFabricated, guardOffbook];

/**
 * Register the three monotonic guards and the advisory listener.
 *
 * A guard registers after the `tools/pre-execute` waterfall, is synchronous, and is
 * monotonic -- a returned reason denies the call and no later listener can turn
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
 * profile root. `dsh-scope` documents that event admission "extends UP" a scope
 * chain, which would make the root an ancestor of every agent; dsh's per-agent
 * guidance says per-agent behavior belongs on `agent.ctx`, obtained in an
 * `agent/created` listener. Reading the shipped code could not settle which one
 * dispatches -- and the trace settled it the other way: **both do**. A shared
 * WeakSet keeps delivery to exactly one advisory per execution.
 *
 * Registering per agent also closes a real gap rather than only hedging an unknown:
 * an agent that already exists when the plugin loads never fires `agent/created`,
 * and the plugin-context registration is what covers it.
 */
export function apply(ctx) {
  const disposers = GUARDS.map((guard) => ctx.tools.guard(guard));
  const advised = new WeakSet();
  const perAgent = new Map();

  const listener = (exec, result, next) => postExecuteAdvisory(exec, result, next, advised);

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
