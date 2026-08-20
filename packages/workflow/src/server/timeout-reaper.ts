import type { DatabaseManager, Row } from '@nocobase/database';

import { WORKFLOW_COLLECTIONS } from '../collections/names.js';
import { EXECUTION_REASON, EXECUTION_STATUS, NODE_RUN_STATUS } from './constants.js';
import type { WorkflowId, WorkflowLogger } from './types.js';
import { asId, noopWorkflowLogger } from './utils.js';

export interface TimeoutReaper {
  start(): void;
  stop(): void;
  /** Run one sweep and return how many runs were reclaimed; used by tests. */
  sweep(): Promise<number>;
}

export interface TimeoutReaperOptions {
  database: DatabaseManager;
  connectionName?: string;
  logger?: WorkflowLogger;
  /** Scan interval in milliseconds, default 60_000. */
  intervalMs?: number;
  /** Maximum rows handled per sweep, default 100. */
  batchSize?: number;
}

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_SIZE = 100;
/** `setTimeout` silently fires immediately beyond this delay. */
const MAX_TIMER_DELAY = 2_147_483_647;

/**
 * Reclaims runs that a previous process left behind.
 *
 * Responsibility split with `Processor`:
 *
 * | component                                             | covers                                  |
 * | ----------------------------------------------------- | --------------------------------------- |
 * | `Processor.enterRunningState` / `leaveRunningState`   | aborting a run that is executing now    |
 * | this reaper                                            | `status = STARTED AND expiresAt < now`  |
 *
 * Without it every restart leaves runs stuck in STARTED forever, because
 * `Dispatcher.recover()` only picks up `dispatched = false AND status IS NULL`.
 */
export function createTimeoutReaper(options: TimeoutReaperOptions): TimeoutReaper {
  const logger = options.logger ?? noopWorkflowLogger;
  const intervalMs = Math.max(1, options.intervalMs ?? DEFAULT_INTERVAL_MS);
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let sweeping: Promise<number> | null = null;
  let stopped = true;

  const query = () => options.database.query(options.connectionName);

  const abortExpiredRun = async (executionId: WorkflowId): Promise<boolean> => {
    // The status guard makes the sweep safe to run concurrently with a live
    // processor: whoever updates the row first wins and the other one is a no-op.
    const result = await query()
      .updateTable(WORKFLOW_COLLECTIONS.runs)
      .set({ status: EXECUTION_STATUS.ABORTED, reason: EXECUTION_REASON.TIMEOUT })
      .where('id', '=', executionId)
      .where('status', '=', EXECUTION_STATUS.STARTED)
      .execute();
    if ((result.updatedCount ?? 0) === 0) {
      return false;
    }
    await query()
      .updateTable(WORKFLOW_COLLECTIONS.nodeRuns)
      .set({ status: NODE_RUN_STATUS.ABORTED })
      .where('workflowRunId', '=', executionId)
      .where('status', '=', NODE_RUN_STATUS.PENDING)
      .execute();
    return true;
  };

  const performSweep = async (): Promise<number> => {
    const now = new Date().toISOString();
    const rows = await query()
      .selectFrom(WORKFLOW_COLLECTIONS.runs)
      .select(['id', 'workflowId', 'expiresAt'])
      .where('status', '=', EXECUTION_STATUS.STARTED)
      .where('expiresAt', 'is not', null)
      .where('expiresAt', '<', now)
      .orderBy('expiresAt')
      .orderBy('id')
      .limit(batchSize)
      .execute<Row>();

    let reclaimed = 0;
    for (const row of rows) {
      const executionId = asId(row.id);
      if (await abortExpiredRun(executionId)) {
        reclaimed += 1;
        logger.info(`Workflow run "${executionId}" was aborted because it expired`, {
          workflowId: row.workflowId,
          reason: EXECUTION_REASON.TIMEOUT,
        });
      }
    }
    return reclaimed;
  };

  const sweep = async (): Promise<number> => {
    // Concurrent sweeps are deduplicated, not queued.
    if (sweeping) {
      return sweeping;
    }
    const running = performSweep();
    sweeping = running;
    try {
      return await running;
    } finally {
      if (sweeping === running) {
        sweeping = null;
      }
    }
  };

  const scheduleNext = (): void => {
    if (stopped) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      if (stopped) {
        return;
      }
      sweep()
        .catch((error: unknown) => logger.error('Workflow timeout sweep failed', { error }))
        .finally(scheduleNext);
    }, Math.min(intervalMs, MAX_TIMER_DELAY));
    // Never hold the process open just to run the next sweep.
    timer.unref?.();
  };

  return {
    start(): void {
      if (!stopped) {
        return;
      }
      stopped = false;
      scheduleNext();
    },

    stop(): void {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },

    sweep,
  };
}
