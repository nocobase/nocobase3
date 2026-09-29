import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseManager } from '@nocobase/db';
import { workflowStore, type WorkflowStore } from '../../collections/store.js';
import { EXECUTION_STATUS, NODE_RUN_STATUS } from '../../engine/constants.js';
import type { WorkflowId, WorkflowQueueTask } from '../../engine/types.js';
import {
  asIdFilter,
  loadRun,
  loadWorkflow,
  nowInstant,
  serializeJson,
} from '../../engine/utils.js';

export interface WaitTarget {
  runId: WorkflowId;
  nodeKey: string;
}

export interface WaitDecision extends WaitTarget {
  status:
    | typeof NODE_RUN_STATUS.RESOLVED
    | typeof NODE_RUN_STATUS.FAILED
    | typeof NODE_RUN_STATUS.ERROR
    | typeof NODE_RUN_STATUS.PENDING;
  result?: unknown;
  error?: string;
  idempotencyKey: string;
}

export type WaitLookup =
  | { status: 'pending'; correlation: unknown }
  | {
      status:
        | 'not-ready'
        | 'finished'
        | 'run-ended'
        | 'run-not-found'
        | 'node-not-found'
        | 'ambiguous';
    };

export type WaitResumeReceipt =
  | { status: 'accepted' | 'duplicate'; requestId: string }
  | {
      status:
        | 'not-ready'
        | 'finished'
        | 'run-ended'
        | 'run-not-found'
        | 'node-not-found'
        | 'ambiguous'
        | 'busy';
    };

type LocatedWait =
  | Exclude<WaitLookup, { status: 'pending' }>
  | { status: 'pending'; nodeRunId: WorkflowId; correlation: unknown };

function jsonDecision(value: unknown): unknown {
  const visit = (item: unknown, ancestors: Set<object>): void => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean')
      return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || ancestors.has(item))
      throw new TypeError('Wait result must be JSON');
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      throw new TypeError('Wait result must be plain JSON');
    ancestors.add(item);
    for (const entry of Object.values(item)) visit(entry, ancestors);
    ancestors.delete(item);
  };
  visit(value, new Set());
  const encoded = JSON.stringify(value);
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > 65_536)
    throw new TypeError('Wait result must be JSON within 65536 UTF-8 bytes');
  return JSON.parse(encoded) as unknown;
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalJson(item)]),
    );
  }
  return value;
}

export class WaitInstructionApi {
  private readonly store: WorkflowStore;

  constructor(
    private readonly context: {
      database: DatabaseManager;
      connectionName?: string;
      enqueue: (task: WorkflowQueueTask) => Promise<void>;
    },
  ) {
    this.store = workflowStore(context.database, context.connectionName);
  }

  async getPending(target: WaitTarget): Promise<WaitLookup> {
    const located = await this.locate(target);
    return located.status === 'pending'
      ? { status: 'pending', correlation: located.correlation }
      : located;
  }

  private async locate(target: WaitTarget): Promise<LocatedWait> {
    const run = await loadRun(this.store, target.runId);
    if (!run) return { status: 'run-not-found' };
    if (run.status === EXECUTION_STATUS.QUEUEING)
      return { status: 'not-ready' };
    if (
      run.status !== EXECUTION_STATUS.STARTED ||
      (run.expiresAt && Date.parse(run.expiresAt) <= Date.now())
    )
      return { status: 'run-ended' };
    const workflow = await loadWorkflow(this.store, run.workflowId);
    if (
      !workflow?.nodes.some(
        (node) => node.key === target.nodeKey && node.type === 'wait',
      )
    )
      return { status: 'node-not-found' };
    const rows = await this.store.nodeRuns.findMany({
      filter: {
        workflowRunId: asIdFilter(target.runId),
        nodeKey: target.nodeKey,
      },
      sort: (sort) => sort.field('id').desc(),
    });
    const pending = rows.filter(
      (row) => Number(row.status) === NODE_RUN_STATUS.PENDING,
    );
    if (pending.length > 1) return { status: 'ambiguous' };
    if (!pending.length)
      return { status: rows.length ? 'finished' : 'not-ready' };
    const nodeRun = pending[0];
    const meta = nodeRun.meta as { wait?: { correlation?: unknown } } | null;
    return {
      status: 'pending',
      nodeRunId: nodeRun.id as WorkflowId,
      correlation: meta?.wait?.correlation ?? null,
    };
  }

  async resume(decision: WaitDecision): Promise<WaitResumeReceipt> {
    if (
      !decision.idempotencyKey ||
      !decision.nodeKey ||
      decision.idempotencyKey.length > 255 ||
      decision.nodeKey.length > 255
    )
      throw new TypeError(
        'Wait nodeKey and idempotencyKey must contain 1 to 255 characters',
      );
    if (
      ![
        NODE_RUN_STATUS.RESOLVED,
        NODE_RUN_STATUS.FAILED,
        NODE_RUN_STATUS.ERROR,
        NODE_RUN_STATUS.PENDING,
      ].includes(decision.status)
    )
      throw new TypeError('Unsupported wait decision status');
    if (decision.error !== undefined && typeof decision.error !== 'string')
      throw new TypeError('Wait error must be a string');
    const result = jsonDecision(decision.result ?? null);
    const hash = createHash('sha256')
      .update(
        JSON.stringify(
          canonicalJson({
            status: decision.status,
            result,
            error: decision.error ?? null,
          }),
        ),
      )
      .digest('hex');
    const existing = await this.store.waitRequests.findOne({
      filter: {
        workflowRunId: asIdFilter(decision.runId),
        nodeKey: decision.nodeKey,
        idempotencyKey: decision.idempotencyKey,
      },
    });
    if (existing) {
      if (existing.decisionHash !== hash)
        throw new Error(
          'Wait idempotency key conflicts with a different decision',
        );
      return { status: 'duplicate', requestId: existing.id as string };
    }
    const lookup = await this.locate(decision);
    if (lookup.status !== 'pending') return lookup;
    const requestId = randomUUID();
    try {
      await this.store.waitRequests.createOne({
        values: {
          id: requestId,
          workflowRunId: asIdFilter(decision.runId),
          nodeRunId: asIdFilter(lookup.nodeRunId),
          nodeKey: decision.nodeKey,
          idempotencyKey: decision.idempotencyKey,
          decisionHash: hash,
          status: decision.status,
          result: serializeJson(result),
          error: decision.error ?? null,
          state: 'queued',
          slot: 'active',
          createdAt: nowInstant(),
          claimedAt: null,
        },
      });
    } catch (error) {
      const raced = await this.store.waitRequests.findOne({
        filter: {
          workflowRunId: asIdFilter(decision.runId),
          nodeKey: decision.nodeKey,
          idempotencyKey: decision.idempotencyKey,
        },
      });
      if (raced) {
        if (raced.decisionHash !== hash)
          throw new Error(
            'Wait idempotency key conflicts with a different decision',
            { cause: error },
          );
        return { status: 'duplicate', requestId: raced.id as string };
      }
      const active = await this.store.waitRequests.findOne({
        filter: { nodeRunId: asIdFilter(lookup.nodeRunId), slot: 'active' },
      });
      if (active) return { status: 'busy' };
      throw error;
    }
    // The durable request is authoritative. A failed publication is retried by recovery.
    try {
      await this.context.enqueue({
        executionId: decision.runId,
        nodeRunId: lookup.nodeRunId,
        waitRequestId: requestId,
      });
    } catch {
      // Recovery republishes the queued request.
    }
    return { status: 'accepted', requestId };
  }
}
