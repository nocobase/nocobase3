import type { Context } from 'hono';
import { randomUUID } from 'node:crypto';
import {
  transactionAuthority,
  type DatabaseConnection,
  type DatabaseManager,
  type QueryAdapter,
} from '@nocobase/db';
import type {
  WorkflowAuditBridge,
  WorkflowAuditContext,
  WorkflowAuditScope,
} from './audit.js';
import { WORKFLOW_COLLECTIONS } from './collections/names.js';
import type { WorkflowId } from './engine/types.js';
import { EXECUTION_STATUS } from './engine/constants.js';

const bridges = new WeakMap<
  DatabaseManager,
  () => WorkflowAuditBridge | undefined
>();

export class WorkflowAuditWriteError extends Error {
  constructor(readonly retryable: boolean = false) {
    super('Workflow audit write failed');
    this.name = 'WorkflowAuditWriteError';
  }
}

/** One immediate retry of terminal persistence only, never of a workflow instruction. */
export async function retryWorkflowFinalization<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof WorkflowAuditWriteError) || !error.retryable)
      throw error;
    return operation();
  }
}

export function attachWorkflowAudit(
  database: DatabaseManager,
  resolve: () => WorkflowAuditBridge | undefined,
): void {
  bridges.set(database, resolve);
}

export function workflowAudit(
  database: DatabaseManager,
): WorkflowAuditBridge | undefined {
  return bridges.get(database)?.();
}

export function captureWorkflowAudit(
  database: DatabaseManager,
): WorkflowAuditContext | null {
  const bridge = workflowAudit(database);
  if (!bridge) return null;
  const scope = bridge.runtime.current();
  return {
    scope: {
      appId: scope.appId,
      securityScope: scope.securityScope,
      actor: { type: scope.actor.type, id: scope.actor.id },
      initiator: scope.initiator
        ? { type: scope.initiator.type, id: scope.initiator.id }
        : undefined,
      roleIds: scope.roleIds ? [...scope.roleIds] : undefined,
      operationId: scope.operationId,
      requestId: scope.requestId,
      correlationId: scope.correlationId,
    },
    attempt: randomUUID(),
  };
}

export async function loadWorkflowAudit(
  query: QueryAdapter,
  runId: WorkflowId,
): Promise<WorkflowAuditContext | null> {
  const value: unknown = await query
    .selectFrom(WORKFLOW_COLLECTIONS.runs)
    .where('id', '=', runId)
    .value('auditContext');
  if (value == null) return null;
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (parsed === null) return null;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('scope' in parsed) ||
    !('attempt' in parsed) ||
    typeof parsed.attempt !== 'string'
  )
    throw new Error('Invalid persisted workflow audit context');
  const scope = parsed.scope;
  if (
    typeof scope !== 'object' ||
    scope === null ||
    !('appId' in scope) ||
    typeof scope.appId !== 'string' ||
    !('actor' in scope) ||
    typeof scope.actor !== 'object' ||
    scope.actor === null ||
    !('type' in scope.actor) ||
    typeof scope.actor.type !== 'string'
  )
    throw new Error('Invalid persisted workflow audit scope');
  // Only server-owned persisted state reaches this boundary; the audit runtime
  // validates and snapshots the complete scope before binding or restoration.
  return parsed as WorkflowAuditContext;
}

export async function recordWorkflowPhase(
  database: DatabaseManager,
  connection: DatabaseConnection,
  runId: WorkflowId,
  phase: string,
  outcome: 'success' | 'failed' | 'accepted' | 'unknown',
  options: {
    readonly human?: boolean;
    readonly phaseKey?: string;
    readonly context?: WorkflowAuditContext | null;
  } = {},
): Promise<void> {
  try {
    await writeWorkflowPhase(
      database,
      connection,
      runId,
      phase,
      outcome,
      options,
    );
  } catch (error) {
    const transaction = transactionAuthority.current(connection);
    if (transaction) transactionAuthority.markRollbackOnly(transaction);
    const retryable =
      error instanceof Error &&
      'code' in error &&
      error.code === 'AUDIT_WRITE_FAILED';
    throw new WorkflowAuditWriteError(retryable);
  }
}

async function writeWorkflowPhase(
  database: DatabaseManager,
  connection: DatabaseConnection,
  runId: WorkflowId,
  phase: string,
  outcome: 'success' | 'failed' | 'accepted' | 'unknown',
  options: {
    readonly human?: boolean;
    readonly phaseKey?: string;
    readonly context?: WorkflowAuditContext | null;
  },
): Promise<void> {
  const bridge = workflowAudit(database);
  if (!bridge) return;
  const persisted =
    options.context === undefined
      ? await loadWorkflowAudit(connection.query, runId)
      : options.context;
  const current = bridge.runtime.current();
  const base: WorkflowAuditScope = persisted?.scope ?? {
    appId: current.appId,
    securityScope: current.securityScope,
    actor: { type: 'unknown' },
  };
  const scope: WorkflowAuditScope = {
    ...base,
    runId: String(runId),
    actor: options.human
      ? bridge.runtime.current().actor
      : { type: 'workflow', id: String(runId) },
    roleIds: options.human ? current.roleIds : undefined,
    initiator:
      base.initiator ??
      (base.actor.type === 'unknown' ? undefined : base.actor),
  };
  const transaction = transactionAuthority.current(connection);
  if (!transaction)
    throw new Error('Workflow audit requires an active transaction');
  await bridge.service.bind(scope, { producer: 'workflow' }).record(
    {
      action: `workflow.${phase}`,
      outcome,
      target: { resource: WORKFLOW_COLLECTIONS.runs, key: String(runId) },
      details: { attempt: persisted?.attempt ?? 'legacy' },
    },
    {
      transaction,
      idempotencyKey: JSON.stringify([
        String(runId),
        persisted?.attempt ?? 'legacy',
        phase,
        options.phaseKey ?? '',
      ]),
    },
  );
}

export async function withWorkflowAudit<T>(
  database: DatabaseManager,
  query: QueryAdapter,
  runId: WorkflowId,
  callback: () => Promise<T>,
  snapshot?: WorkflowAuditContext | null,
): Promise<T> {
  const bridge = workflowAudit(database);
  const context =
    snapshot === undefined
      ? bridge
        ? await loadWorkflowAudit(query, runId)
        : null
      : snapshot;
  if (!bridge) return callback();
  const current = bridge.runtime.current();
  const original: WorkflowAuditScope = context?.scope ?? {
    appId: current.appId,
    securityScope: current.securityScope,
    actor: { type: 'unknown' },
  };
  const scope: WorkflowAuditScope = {
    ...original,
    runId: String(runId),
    actor: { type: 'workflow', id: String(runId) },
    roleIds: undefined,
    initiator:
      original.initiator ??
      (original.actor.type === 'unknown' ? undefined : original.actor),
  };
  return bridge.runtime.runBackground(
    {
      appId: scope.appId,
      securityScope: scope.securityScope,
      runId: scope.runId,
    },
    async () => scope,
    callback,
  );
}

/** Each explicit rerun is a new attempt; ordinary duplicate task delivery keeps its attempt. */
export async function beginWorkflowAttempt(
  database: DatabaseManager,
  connection: DatabaseConnection,
  runId: WorkflowId,
  attempt: string,
): Promise<WorkflowAuditContext | null | undefined> {
  if (!workflowAudit(database)) return null;
  const current = await loadWorkflowAudit(connection.query, runId);
  if (!current || current.attempt === attempt) return current;
  const context = { ...current, attempt };
  const claimed = await connection.query
    .updateTable(WORKFLOW_COLLECTIONS.runs)
    .set({ auditContext: JSON.stringify(context) })
    .where('id', '=', runId)
    .where('status', '=', EXECUTION_STATUS.STARTED)
    .execute();
  if ((claimed.updatedCount ?? 0) === 0) return undefined;
  await recordWorkflowPhase(
    database,
    connection,
    runId,
    'retried',
    'accepted',
    { context },
  );
  return context;
}

const executionContexts = new WeakMap<object, WorkflowAuditContext | null>();
export function bindWorkflowExecutionAudit(
  execution: object,
  context: WorkflowAuditContext | null,
): void {
  executionContexts.set(execution, context);
}
export async function workflowExecutionAudit(
  execution: object,
  database: DatabaseManager,
  query: QueryAdapter,
  runId: WorkflowId,
): Promise<WorkflowAuditContext | null> {
  if (!executionContexts.has(execution))
    executionContexts.set(
      execution,
      workflowAudit(database) ? await loadWorkflowAudit(query, runId) : null,
    );
  return executionContexts.get(execution) ?? null;
}

const httpRuns = new WeakMap<Context, string>();
const httpBridges = new WeakMap<Context, WorkflowAuditBridge>();
export function attachWorkflowHttp(
  context: Context,
  bridge: WorkflowAuditBridge,
): void {
  httpBridges.set(context, bridge);
}
export async function captureWorkflowHttpRun(
  context: Context,
  runId: string,
): Promise<void> {
  httpRuns.set(context, runId);
  const bridge = httpBridges.get(context);
  if (!bridge) return;
  const scope = { ...bridge.runtime.current(), runId };
  await bridge.runtime.runBackground(
    { appId: scope.appId, securityScope: scope.securityScope, runId },
    async () => scope,
    async () => {
      bridge.collector.captureScope(context);
    },
  );
}
export function workflowHttpTarget(
  context: Context,
): { resource: string; key: string } | undefined {
  const id = httpRuns.get(context);
  return id === undefined
    ? undefined
    : { resource: WORKFLOW_COLLECTIONS.runs, key: id };
}
