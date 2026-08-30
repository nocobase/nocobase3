import type { DatabaseManager, Row } from '@nocobase/app-database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKFLOW_COLLECTIONS } from '../server/collections/names.js';
import {
  EXECUTION_REASON,
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
} from '../server/engine/constants.js';
import { createTimeoutReaper } from '../server/engine/timeout-reaper.js';
import type { WorkflowId } from '../server/engine/types.js';
import { createTestDatabase, createTestWorkflow } from './helpers.js';

type RunInput = {
  eventKey: string;
  status: number | null;
  expiresAt: string | null;
};

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

describe('timeout reaper', () => {
  let database: DatabaseManager;
  let workflowId: WorkflowId;

  async function insertRun(input: RunInput): Promise<WorkflowId> {
    await database
      .query()
      .insertInto(WORKFLOW_COLLECTIONS.runs)
      .values({
        workflowId,
        workflowKey: 'reaped',
        eventKey: input.eventKey,
        input: JSON.stringify({}),
        parameters: JSON.stringify({}),
        status: input.status,
        dispatched: input.status != null,
        stack: JSON.stringify([]),
        output: JSON.stringify(null),
        startedAt:
          input.status == null
            ? null
            : new Date(Date.now() - 3_600_000).toISOString(),
        expiresAt: input.expiresAt,
        createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        manually: false,
      })
      .execute();
    const id = await database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.runs)
      .where('eventKey', '=', input.eventKey)
      .value<WorkflowId>('id');
    if (id == null) {
      throw new Error(`Failed to insert run "${input.eventKey}"`);
    }
    return id;
  }

  async function readRun(id: WorkflowId): Promise<Row> {
    return database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.runs)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow<Row>();
  }

  beforeEach(async () => {
    database = await createTestDatabase();
    const workflow = await createTestWorkflow(database, {
      key: 'reaped',
      nodes: [{ key: 'only', type: 'echo' }],
    });
    workflowId = workflow.id;
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('aborts a started run whose deadline has passed', async () => {
    const expired = await insertRun({
      eventKey: 'expired',
      status: EXECUTION_STATUS.STARTED,
      expiresAt: minutesFromNow(-1),
    });
    const reaper = createTimeoutReaper({ database });

    await expect(reaper.sweep()).resolves.toBe(1);

    const run = await readRun(expired);
    expect(run.status).toBe(EXECUTION_STATUS.ABORTED);
    expect(run.reason).toBe(EXECUTION_REASON.TIMEOUT);
    expect(run.finishedAt).toBeTruthy();
  });

  it('leaves runs that are not expired, not started, or have no deadline', async () => {
    const pending = await insertRun({
      eventKey: 'still-running',
      status: EXECUTION_STATUS.STARTED,
      expiresAt: minutesFromNow(10),
    });
    const endless = await insertRun({
      eventKey: 'no-deadline',
      status: EXECUTION_STATUS.STARTED,
      expiresAt: null,
    });
    const queueing = await insertRun({
      eventKey: 'queueing',
      status: EXECUTION_STATUS.QUEUEING,
      expiresAt: minutesFromNow(-1),
    });
    const resolved = await insertRun({
      eventKey: 'resolved',
      status: EXECUTION_STATUS.RESOLVED,
      expiresAt: minutesFromNow(-1),
    });
    const reaper = createTimeoutReaper({ database });

    await expect(reaper.sweep()).resolves.toBe(0);

    expect((await readRun(pending)).status).toBe(EXECUTION_STATUS.STARTED);
    expect((await readRun(endless)).status).toBe(EXECUTION_STATUS.STARTED);
    expect((await readRun(queueing)).status).toBe(EXECUTION_STATUS.QUEUEING);
    expect((await readRun(resolved)).status).toBe(EXECUTION_STATUS.RESOLVED);
  });

  it('aborts the pending nodeRuns of a reclaimed run', async () => {
    const expired = await insertRun({
      eventKey: 'with-nodeRuns',
      status: EXECUTION_STATUS.STARTED,
      expiresAt: minutesFromNow(-1),
    });
    await database
      .query()
      .insertInto(WORKFLOW_COLLECTIONS.nodeRuns)
      .values([
        {
          workflowRunId: expired,
          nodeId: 1,
          nodeKey: 'done',
          status: NODE_RUN_STATUS.RESOLVED,
          meta: JSON.stringify(null),
          result: JSON.stringify(1),
          startedAt: new Date().toISOString(),
        },
        {
          workflowRunId: expired,
          nodeId: 2,
          nodeKey: 'waiting',
          status: NODE_RUN_STATUS.PENDING,
          meta: JSON.stringify(null),
          result: JSON.stringify(null),
          startedAt: new Date().toISOString(),
        },
      ])
      .execute();

    await expect(createTimeoutReaper({ database }).sweep()).resolves.toBe(1);

    const nodeRuns = await database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.nodeRuns)
      .select(['nodeKey', 'status', 'finishedAt'])
      .where('workflowRunId', '=', expired)
      .orderBy('id')
      .execute<Row>();
    expect(nodeRuns).toEqual([
      { nodeKey: 'done', status: NODE_RUN_STATUS.RESOLVED, finishedAt: null },
      {
        nodeKey: 'waiting',
        status: NODE_RUN_STATUS.ABORTED,
        finishedAt: expect.anything(),
      },
    ]);
  });

  it('honours the batch size and reclaims the rest on the next sweep', async () => {
    for (const index of [1, 2, 3]) {
      await insertRun({
        eventKey: `batch-${index}`,
        status: EXECUTION_STATUS.STARTED,
        expiresAt: minutesFromNow(-index),
      });
    }
    const reaper = createTimeoutReaper({ database, batchSize: 2 });

    await expect(reaper.sweep()).resolves.toBe(2);
    await expect(reaper.sweep()).resolves.toBe(1);
    await expect(reaper.sweep()).resolves.toBe(0);
  });

  it('is idempotent, so a second sweep does not reclaim the same run twice', async () => {
    await insertRun({
      eventKey: 'once',
      status: EXECUTION_STATUS.STARTED,
      expiresAt: minutesFromNow(-1),
    });
    const reaper = createTimeoutReaper({ database });

    await expect(reaper.sweep()).resolves.toBe(1);
    await expect(reaper.sweep()).resolves.toBe(0);
  });

  it('deduplicates concurrent sweeps', async () => {
    await insertRun({
      eventKey: 'concurrent',
      status: EXECUTION_STATUS.STARTED,
      expiresAt: minutesFromNow(-1),
    });
    const reaper = createTimeoutReaper({ database });

    const [first, second] = await Promise.all([reaper.sweep(), reaper.sweep()]);
    expect(first).toBe(1);
    expect(second).toBe(1);
  });

  it('sweeps on its interval and stops cleanly without leaking a timer', async () => {
    await insertRun({
      eventKey: 'scheduled',
      status: EXECUTION_STATUS.STARTED,
      expiresAt: minutesFromNow(-1),
    });
    const reaper = createTimeoutReaper({ database, intervalMs: 5 });

    reaper.start();
    reaper.start(); // idempotent
    const deadline = Date.now() + 2000;
    let status: unknown = EXECUTION_STATUS.STARTED;
    while (Date.now() < deadline && status !== EXECUTION_STATUS.ABORTED) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      status = await database
        .query()
        .selectFrom(WORKFLOW_COLLECTIONS.runs)
        .where('eventKey', '=', 'scheduled')
        .value('status');
    }
    expect(status).toBe(EXECUTION_STATUS.ABORTED);

    reaper.stop();
    reaper.stop(); // idempotent
  });
});
