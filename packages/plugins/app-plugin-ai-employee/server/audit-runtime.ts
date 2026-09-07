import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { AIEmployeeAuditBridge, AIEmployeeAuditScope } from './audit.js';
type Trace = Omit<AIEmployeeAuditScope, 'actor' | 'initiator' | 'roleIds'>;
type Outcome = 'success' | 'failed' | 'denied' | 'accepted' | 'unknown';
interface Binding {
  bridge: AIEmployeeAuditBridge;
  employeeId: string;
  sessionId: string;
  parent?: AIEmployeeAuditScope;
}
interface Run {
  binding: Binding;
  scope: AIEmployeeAuditScope;
  outcome?: Outcome;
}
const bindings = new WeakMap<object, Binding>();
const contexts = new WeakMap<
  object,
  { bridge: AIEmployeeAuditBridge; parent?: AIEmployeeAuditScope }
>();
const runs = new AsyncLocalStorage<Run>();

export function markAIRunOutcome(outcome: Outcome, owner: object): void {
  const run = runs.getStore();
  if (run && bindings.get(owner) === run.binding) run.outcome = outcome;
}

export async function recordAIPersistenceFailure(owner: object): Promise<void> {
  const run = runs.getStore();
  if (!run || bindings.get(owner) !== run.binding) return;
  run.outcome = 'failed';
  await record(run, 'ai.conversation.persist', 'failed', {
    reasonCode: 'AI_CONVERSATION_PERSISTENCE_FAILED',
  });
}

export function bindAIRequestAudit(
  context: object,
  bridge: AIEmployeeAuditBridge,
): void {
  const current = bridge.runtime.current();
  contexts.set(context, {
    bridge,
    parent: current.requestId || current.runId ? current : undefined,
  });
}
export function bindAIConversationAudit(
  conversation: object,
  context: object,
  employeeId: string,
  sessionId: string,
): void {
  const captured = contexts.get(context);
  if (captured)
    bindings.set(conversation, { ...captured, employeeId, sessionId });
}

function restore<T>(
  binding: Binding,
  scope: AIEmployeeAuditScope,
  callback: () => Promise<T>,
): Promise<T> {
  const trace: Trace = {
    appId: scope.appId,
    securityScope: scope.securityScope,
    operationId: scope.operationId,
    requestId: scope.requestId,
    runId: scope.runId,
    correlationId: scope.correlationId,
  };
  return binding.bridge.runtime.runBackground(
    trace,
    () => Promise.resolve(scope),
    callback,
  );
}

async function record(
  run: Run,
  action: string,
  outcome: Outcome,
  details?: Readonly<Record<string, unknown>>,
  key: string = randomUUID(),
): Promise<void> {
  try {
    await run.binding.bridge.service
      .bind(run.scope, { producer: 'ai-employee' })
      .record(
        {
          action,
          outcome,
          target: { resource: 'aiConversations', key: run.binding.sessionId },
          details,
        },
        { idempotencyKey: `${run.scope.runId}:${key}` },
      );
  } catch {
    console.error('AI audit observation failed.', {
      code: 'AI_AUDIT_WRITE_FAILED',
    });
  }
}

async function executeAuditedAI<T>(
  conversation: object,
  callback: () => Promise<T>,
): Promise<T> {
  const binding = bindings.get(conversation);
  if (!binding) return callback();
  return restore(
    binding,
    binding.parent ?? binding.bridge.runtime.current(),
    () =>
      binding.bridge.runtime.runChild(
        { actor: { type: 'agent', id: binding.employeeId } },
        async () => {
          const run: Run = { binding, scope: binding.bridge.runtime.current() };
          return runs.run(run, async () => {
            await record(run, 'ai.run.started', 'accepted');
            try {
              const result = await callback();
              const interrupted =
                typeof result === 'object' &&
                result !== null &&
                '__interrupt__' in result;
              await record(
                run,
                'ai.run.finished',
                run.outcome ??
                  (result === false
                    ? 'failed'
                    : interrupted
                      ? 'accepted'
                      : 'success'),
              );
              return result;
            } catch (error) {
              await record(
                run,
                'ai.run.finished',
                error instanceof Error && error.name === 'GraphInterrupt'
                  ? 'accepted'
                  : 'failed',
              );
              throw error;
            }
          });
        },
      ),
  );
}

async function* executeAuditedAIStream<T>(
  conversation: object,
  callback: () => AsyncGenerator<T>,
): AsyncGenerator<T> {
  const binding = bindings.get(conversation);
  if (!binding) {
    yield* callback();
    return;
  }
  const scope = await restore(
    binding,
    binding.parent ?? binding.bridge.runtime.current(),
    async () =>
      binding.bridge.runtime.runChild(
        { actor: { type: 'agent', id: binding.employeeId } },
        () => binding.bridge.runtime.current(),
      ),
  );
  const run: Run = { binding, scope };
  const trace: Trace = {
    appId: scope.appId,
    securityScope: scope.securityScope,
    operationId: scope.operationId,
    requestId: scope.requestId,
    runId: scope.runId,
    correlationId: scope.correlationId,
  };
  const scoped = <R>(fn: () => Promise<R>): Promise<R> =>
    binding.bridge.runtime.runBackground(
      trace,
      () => Promise.resolve(scope),
      () => runs.run(run, fn),
    );
  const iterator = callback();
  let outcome: Outcome = 'unknown';
  await record(run, 'ai.run.started', 'accepted');
  try {
    for (;;) {
      const next = await scoped(() => iterator.next());
      if (next.done) {
        if (outcome !== 'accepted') outcome = 'success';
        break;
      }
      if (
        typeof next.value === 'object' &&
        next.value !== null &&
        'type' in next.value &&
        next.value.type === 'interrupt_requested'
      )
        outcome = 'accepted';
      yield next.value;
    }
  } catch (error) {
    outcome = 'failed';
    throw error;
  } finally {
    try {
      await scoped(() => iterator.return(undefined));
    } finally {
      await record(run, 'ai.run.finished', run.outcome ?? outcome);
    }
  }
}

export async function beginAIToolAttempt(
  toolName: string,
  owner?: object,
): Promise<((outcome: Outcome) => Promise<void>) | undefined> {
  const run = runs.getStore();
  if (!run || (owner && bindings.get(owner) !== run.binding)) return undefined;
  const attempt = randomUUID();
  await record(
    run,
    'ai.tool.attempt',
    'accepted',
    { toolName, attempt },
    `${attempt}:start`,
  );
  return (outcome) =>
    record(
      run,
      'ai.tool.result',
      outcome,
      { toolName, attempt },
      `${attempt}:result`,
    );
}

interface AuditAdmission {
  readonly bridge: AIEmployeeAuditBridge;
  active: boolean;
  release(): void;
}
interface AuditLifecycle {
  stopping: boolean;
  readonly pending: Set<Promise<void>>;
  drain?: Promise<void>;
}
const lifecycles = new WeakMap<AIEmployeeAuditBridge, AuditLifecycle>();
const admissions = new AsyncLocalStorage<AuditAdmission>();

function acquireAuditAdmission(bridge: AIEmployeeAuditBridge): AuditAdmission {
  let state = lifecycles.get(bridge);
  if (!state) {
    state = { stopping: false, pending: new Set() };
    lifecycles.set(bridge, state);
  }
  const parent = admissions.getStore();
  if (state.stopping && !(parent?.active && parent.bridge === bridge))
    throw new Error('AI audit execution is shutting down.');
  let resolve!: () => void;
  const pending = new Promise<void>((done) => {
    resolve = done;
  });
  state.pending.add(pending);
  const lifecycle = state;
  const admission: AuditAdmission = {
    bridge,
    active: true,
    release: (): void => {
      if (!admission.active) return;
      admission.active = false;
      lifecycle.pending.delete(pending);
      resolve();
    },
  };
  return admission;
}

/** Called by this bridge's owning Provider, after host admission has closed. */
export function stopAndDrainAI(bridge: AIEmployeeAuditBridge): Promise<void> {
  let state = lifecycles.get(bridge);
  if (!state) {
    state = { stopping: false, pending: new Set() };
    lifecycles.set(bridge, state);
  }
  state.stopping = true;
  const lifecycle = state;
  state.drain ??= (async (): Promise<void> => {
    // Accepted parent runs may still start and await nested runs during shutdown.
    while (lifecycle.pending.size) await Promise.all([...lifecycle.pending]);
  })();
  return state.drain;
}

export async function runAuditedAI<T>(
  conversation: object,
  callback: () => Promise<T>,
): Promise<T> {
  const binding = bindings.get(conversation);
  if (!binding) return callback();
  const lease = acquireAuditAdmission(binding.bridge);
  try {
    return await admissions.run(lease, () =>
      executeAuditedAI(conversation, callback),
    );
  } finally {
    lease.release();
  }
}

export async function* streamAuditedAI<T>(
  conversation: object,
  callback: () => AsyncGenerator<T>,
): AsyncGenerator<T> {
  const binding = bindings.get(conversation);
  if (!binding) {
    yield* callback();
    return;
  }
  // Generator bodies start at first next(), so an unconsumed stream holds no lease.
  const lease = acquireAuditAdmission(binding.bridge);
  const iterator = executeAuditedAIStream(conversation, callback);
  try {
    for (;;) {
      const next = await admissions.run(lease, () => iterator.next());
      if (next.done) return;
      yield next.value;
    }
  } finally {
    try {
      await admissions.run(lease, () => iterator.return(undefined));
    } finally {
      lease.release();
    }
  }
}
