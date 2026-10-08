/**
 * DSH wiring for the mixtape_harness guardrails.
 *
 * All of the logic lives in `checks.js`, which carries no dsh imports and is
 * therefore exercisable by a bare `node dsh-guards/test.mjs`. This module is the
 * thin part that needs a harness: it registers the three guards and the
 * post-execute advisory listener, and it builds the context message.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS NO BARE IMPORT HERE
 *
 * This file originally did `import { createUserMessage } from '@deepseek-ai/dsh-llm'`
 * on the theory that a bundle may rely on packages shipped with dsh. It may not:
 * the plugin then failed to activate with the bundle's top-level code never
 * having run -- a LINK-time resolution failure, before a single statement -- and
 * because the failure was silent from the outside it took five restarts to see.
 *
 * `createUserMessage` turned out to need nothing from dsh. Its whole
 * implementation is:
 *
 *     function createMessage(input) {
 *       return deepFreeze(structuredClone({ ...input, id: brandString(randomUUID()) }));
 *     }
 *     function createUserMessage(input) { return createMessage({ ...input, role: 'user' }); }
 *
 * an identity, a role tag, and a deep freeze. All three are reproduced below with
 * node builtins, which always resolve. That leaves this module with NO external
 * specifier of any kind, so it cannot fail to link.
 * ---------------------------------------------------------------------------
 *
 * TEMPORARY INSTRUMENTATION (remove once the advisory path is confirmed).
 *
 * The advisories produced nothing while the guards worked, and the session log
 * showed no plugin-sourced context. Rather than guess again, every step is traced,
 * including module load, so "did this file even execute?" is answerable directly
 * instead of inferred.
 *
 *   switch: <this dir>/.trace        (create the file to arm, delete to disarm)
 *   log:    <this dir>/.trace.log
 *
 * The switch sits next to this file rather than in the OS temp directory, because
 * the host process's `os.tmpdir()` is not necessarily the one a shell sees -- and
 * a trace that silently fails to arm would cost another restart. Both files are
 * gitignored, and tracing can never break a guard.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  guardRawData,
  guardFabricated,
  guardOffbook,
  postExecuteWarnings,
  postExecuteAdvisory,
} from './checks.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRACE_SWITCH = path.join(HERE, '.trace');
const TRACE_LOG = path.join(HERE, '.trace.log');

function trace(entry) {
  try {
    if (!fs.existsSync(TRACE_SWITCH)) return;
    fs.appendFileSync(TRACE_LOG, `${JSON.stringify({ t: Date.now(), ...entry })}\n`);
  } catch {
    /* tracing must never interfere with a guard */
  }
}

// The module itself loaded -- the one fact the previous round could only infer.
trace({ where: 'module:loaded' });

export const inject = ['tools'];

const GUARDS = [guardRawData, guardFabricated, guardOffbook];

/** The same deep freeze dsh's own message factory applies. */
function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

/** A plugin-tagged user message, built exactly as createUserMessage would. */
function advisoryContext(text) {
  try {
    const message = deepFreeze(
      structuredClone({
        content: [{ type: 'text', text }],
        source: { kind: 'plugin' }, // a kind dsh itself uses for plugin-injected context
        role: 'user',
        id: randomUUID(),
      }),
    );
    trace({ where: 'advisoryContext', ok: true, keys: Object.keys(message) });
    return message;
  } catch (error) {
    trace({ where: 'advisoryContext', ok: false, error: String(error) });
    throw error;
  }
}

export function apply(ctx) {
  trace({
    where: 'apply:enter',
    hasTools: Boolean(ctx?.tools),
    hasOn: typeof ctx?.on,
  });

  const disposers = [];
  try {
    for (const guard of GUARDS) disposers.push(ctx.tools.guard(guard));
    trace({ where: 'apply:guards', ok: true, count: GUARDS.length });
  } catch (error) {
    trace({ where: 'apply:guards', ok: false, error: String(error) });
  }

  const advised = new WeakSet();
  const perAgent = new Map();

  const makeListener = (tag) => async (exec, result, next) => {
    trace({ where: 'listener:enter', tag, name: exec?.name, argKeys: Object.keys(exec?.arguments ?? {}) });
    try {
      const decision = await next();
      const warnings = postExecuteWarnings(exec);
      trace({
        where: 'listener:checked',
        tag,
        alreadyAdvised: advised.has(exec),
        warnings: warnings.length,
        decisionKind: decision?.kind,
        filePath: exec?.arguments?.file_path,
      });
      return await postExecuteAdvisory(exec, result, next, advisoryContext, advised);
    } catch (error) {
      trace({ where: 'listener:threw', tag, error: String(error) });
      throw error;
    }
  };

  try {
    const off = ctx.on('tools/post-execute', makeListener('own-ctx'));
    if (typeof off === 'function') disposers.push(off);
    trace({ where: 'apply:own-ctx', ok: true, disposer: typeof off });
  } catch (error) {
    trace({ where: 'apply:own-ctx', ok: false, error: String(error) });
  }

  try {
    const offCreated = ctx.on('agent/created', ({ agent }) => {
      trace({ where: 'agent:created', hasCtx: Boolean(agent?.ctx) });
      if (!agent?.ctx || perAgent.has(agent)) return;
      try {
        const dispose = agent.ctx.on('tools/post-execute', makeListener('agent-ctx'));
        if (typeof dispose === 'function') perAgent.set(agent, dispose);
        trace({ where: 'apply:agent-ctx', ok: true });
      } catch (error) {
        trace({ where: 'apply:agent-ctx', ok: false, error: String(error) });
      }
    });
    const offDisposed = ctx.on('agent/disposed', ({ agent }) => {
      const dispose = perAgent.get(agent);
      if (typeof dispose === 'function') dispose();
      perAgent.delete(agent);
    });
    if (typeof offCreated === 'function') disposers.push(offCreated);
    if (typeof offDisposed === 'function') disposers.push(offDisposed);
    trace({ where: 'apply:agent-events', ok: true });
  } catch (error) {
    trace({ where: 'apply:agent-events', ok: false, error: String(error) });
  }

  trace({ where: 'apply:done', disposers: disposers.length });

  return () => {
    for (const dispose of disposers) if (typeof dispose === 'function') dispose();
    for (const dispose of perAgent.values()) if (typeof dispose === 'function') dispose();
    perAgent.clear();
  };
}
