/**
 * DSH wiring for the mixtape_harness guardrails.
 *
 * All of the logic lives in `checks.js`, which carries no dsh imports and is
 * therefore exercisable by a bare `node dsh-guards/test.mjs`. This module is the
 * thin part that needs a harness.
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
 * The message factory turned out to be unnecessary as well: see the delivery note
 * in checks.js. This module imports nothing outside `./` and `node:` builtins, so
 * it cannot fail to link.
 * ---------------------------------------------------------------------------
 *
 * TEMPORARY INSTRUMENTATION (remove once delivery is confirmed end to end).
 *
 * It records the module loading, the registrations, and one line per post-execute
 * decision. The switch sits next to this file rather than in the OS temp
 * directory, because the host process's `os.tmpdir()` is not necessarily the one a
 * shell sees -- and a trace that silently fails to arm would cost another restart.
 *
 *   switch: <this dir>/.trace        (create the file to arm, delete to disarm)
 *   log:    <this dir>/.trace.log
 *
 * Both are gitignored, and tracing can never break a guard.
 *
 * ONE RULE FOR THE INSTRUMENTATION: the waterfall's `next` continuation is called
 * exactly once per listener. An earlier traced version awaited `next()` for its own
 * record and then let the check await it again; the second call re-entered the
 * chain, and because the OUTERMOST listener's return value is the one the framework
 * keeps, the decision that came back had lost the advisory. The trace observes
 * `next()` by wrapping it, never by calling it twice.
 */
import fs from 'node:fs';
import path from 'node:path';
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

// The module itself loaded -- the one fact an earlier round could only infer.
trace({ where: 'module:loaded' });

export const inject = ['tools'];

const GUARDS = [guardRawData, guardFabricated, guardOffbook];

export function apply(ctx) {
  trace({ where: 'apply:enter', hasTools: Boolean(ctx?.tools), hasOn: typeof ctx?.on });

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
    // Wrap `next` so the trace can see the downstream decision without calling the
    // continuation a second time.
    const tracedNext = async () => {
      const decision = await next();
      trace({
        where: 'listener:checked',
        tag,
        name: exec?.name,
        warnings: postExecuteWarnings(exec).length,
        alreadyAdvised: advised.has(exec),
        decisionKind: decision?.kind,
        decisionHasValue: Boolean(decision && Object.hasOwn(decision, 'value')),
        decisionBlocks: Array.isArray(decision?.content) ? decision.content.length : 0,
        filePath: exec?.arguments?.file_path,
      });
      return decision;
    };

    try {
      const out = await postExecuteAdvisory(exec, result, tracedNext, advised);
      trace({
        where: 'listener:returned',
        tag,
        blocks: Array.isArray(out?.content) ? out.content.length : 0,
      });
      return out;
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
