import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseManager } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  createQueueManager,
  queueMigrationSource,
  type AppQueueConfig,
  type NocoBaseQueueManager,
} from '@nocobase/queue';
import WorkflowEngine from '../server/engine/engine.js';
import { createWorkflowRunServices } from '../server/engine/run-services.js';
import { createWaitInstruction, workflow } from '../dsl/index.js';
import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
} from '../server/engine/constants.js';
import { WaitInstructionApi } from '../server/instructions/wait/api.js';
import {
  asIdFilter,
  nowInstant,
  serializeJson,
} from '../server/engine/utils.js';
import {
  createTestDatabase,
  createTestWorkflow,
  createModuleRoot,
  listNodeRuns,
  readRun,
  removeModuleRoots,
  waitFor,
  testStore,
  insertTestRun,
} from './helpers.js';

describe('wait instruction', () => {
  it('keeps the authored result schema in the flat definition', () => {
    const result = {
      type: 'object' as const,
      properties: { paymentId: { type: 'string' as const } },
      required: ['paymentId'],
    };
    const flat = workflow({ key: 'payment', title: 'Payment' })
      .addNode(
        createWaitInstruction<{ paymentId: string }>(
          { key: 'await-payment', description: 'Wait for payment.' },
          result,
        ),
      )
      .compile();
    expect(flat.nodes[0]).toMatchObject({
      key: 'await-payment',
      type: 'wait',
      result,
    });
  });

  let database: DatabaseManager;
  let engine: WorkflowEngine;
  let wait: WaitInstructionApi;
  let queueManager: NocoBaseQueueManager | null = null;
  const additionalEngines: WorkflowEngine[] = [];

  beforeEach(async () => {
    database = await createTestDatabase();
    engine = new WorkflowEngine({ database, timeoutReaper: false });
    await engine.initialize();
    wait = engine.getInstruction<WaitInstructionApi>('wait');
  });

  afterEach(async () => {
    await Promise.all(
      additionalEngines.splice(0).map((runtime) => runtime.dispose()),
    );
    await engine.dispose();
    await queueManager?.close();
    queueManager = null;
    await database.destroy();
    await removeModuleRoots();
  });

  async function start() {
    const workflow = await createTestWorkflow(database, {
      key: 'payment',
      nodes: [
        {
          key: 'await-payment',
          type: 'wait',
          config: { correlation: '{{ $input.paymentId }}' },
          downstreamKey: 'done',
        },
        {
          key: 'done',
          type: 'terminate',
          config: {},
          upstreamKey: 'await-payment',
        },
      ],
    });
    const run = await engine.trigger(workflow, { paymentId: 'pay-1' });
    if (!run || !('id' in run)) throw new Error('No run');
    return { workflow, runId: run.id };
  }

  it('persists a pending node and resumes the same run with its result', async () => {
    const { runId } = await start();
    const target = { runId, nodeKey: 'await-payment' };
    expect(await wait.getPending(target)).toEqual({
      status: 'pending',
      correlation: 'pay-1',
    });
    const receipt = await wait.resume({
      ...target,
      idempotencyKey: 'callback-1',
      status: NODE_RUN_STATUS.RESOLVED,
      result: { paymentId: 'pay-1' },
    });
    expect(receipt.status).toBe('accepted');
    expect((await readRun(database, runId)).status).toBe(
      EXECUTION_STATUS.RESOLVED,
    );
    expect(await listNodeRuns(database, runId)).toMatchObject([
      {
        nodeKey: 'await-payment',
        status: NODE_RUN_STATUS.RESOLVED,
        result: { paymentId: 'pay-1' },
      },
      { nodeKey: 'done', status: NODE_RUN_STATUS.RESOLVED },
    ]);
    expect(
      await wait.resume({
        ...target,
        idempotencyKey: 'callback-1',
        status: NODE_RUN_STATUS.RESOLVED,
        result: { paymentId: 'pay-1' },
      }),
    ).toEqual({
      status: 'duplicate',
      requestId: (receipt as { requestId: string }).requestId,
    });
    await expect(
      wait.resume({
        ...target,
        idempotencyKey: 'callback-1',
        status: NODE_RUN_STATUS.ERROR,
      }),
    ).rejects.toThrow('conflicts');
    expect(await wait.getPending(target)).toEqual({ status: 'run-ended' });
  });

  it('accepts a pending decision then a new event, while preserving correlation', async () => {
    const { runId } = await start();
    const target = { runId, nodeKey: 'await-payment' };
    expect(
      (
        await wait.resume({
          ...target,
          idempotencyKey: 'pending-1',
          status: NODE_RUN_STATUS.PENDING,
          result: { step: 1 },
        })
      ).status,
    ).toBe('accepted');
    expect((await readRun(database, runId)).status).toBe(
      EXECUTION_STATUS.STARTED,
    );
    expect(await wait.getPending(target)).toMatchObject({
      status: 'pending',
      correlation: 'pay-1',
    });
    expect(
      (
        await wait.resume({
          ...target,
          idempotencyKey: 'success-2',
          status: NODE_RUN_STATUS.RESOLVED,
          result: { paymentId: 'pay-1' },
        })
      ).status,
    ).toBe('accepted');
    expect((await readRun(database, runId)).status).toBe(
      EXECUTION_STATUS.RESOLVED,
    );
  });

  it('treats JSON objects with different property order as the same event decision', async () => {
    const { runId } = await start();
    const target = {
      runId,
      nodeKey: 'await-payment',
      idempotencyKey: 'ordered',
      status: NODE_RUN_STATUS.RESOLVED,
    };
    const first = await wait.resume({ ...target, result: { a: 1, b: 2 } });
    const again = await wait.resume({ ...target, result: { b: 2, a: 1 } });
    expect(again).toEqual({
      status: 'duplicate',
      requestId: (first as { requestId: string }).requestId,
    });
  });

  it.each([NODE_RUN_STATUS.FAILED, NODE_RUN_STATUS.ERROR])(
    'follows the failure path for %i',
    async (status) => {
      const { runId } = await start();
      const receipt = await wait.resume({
        runId,
        nodeKey: 'await-payment',
        idempotencyKey: String(status),
        status,
        error: 'rejected',
      });
      expect(receipt.status).toBe('accepted');
      expect((await readRun(database, runId)).status).toBe(status);
      expect(await listNodeRuns(database, runId)).toMatchObject([
        { nodeKey: 'await-payment', status, error: 'rejected' },
      ]);
    },
  );

  it('distinguishes not ready, ended, missing, and ambiguous targets', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'states',
      nodes: [{ key: 'hold', type: 'wait' }],
    });
    const earlyRunId = await insertTestRun(database, {
      workflowId: workflow.id,
      workflowKey: workflow.key,
      eventKey: 'early',
      status: EXECUTION_STATUS.STARTED,
      dispatched: true,
    });
    expect(
      await wait.getPending({ runId: earlyRunId, nodeKey: 'hold' }),
    ).toEqual({ status: 'not-ready' });
    const queuedRunId = await insertTestRun(database, {
      workflowId: workflow.id,
      workflowKey: workflow.key,
      eventKey: 'queued',
    });
    expect(
      await wait.getPending({ runId: queuedRunId, nodeKey: 'hold' }),
    ).toEqual({
      status: 'not-ready',
    });
    const run = await engine.trigger(workflow, {});
    if (!run || !('id' in run)) throw new Error('No run');
    const target = { runId: run.id, nodeKey: 'hold' };
    expect(await wait.getPending({ ...target, nodeKey: 'unknown' })).toEqual({
      status: 'node-not-found',
    });
    expect(await wait.getPending({ ...target, runId: '999999' })).toEqual({
      status: 'run-not-found',
    });
    const first = await wait.getPending(target);
    expect(first.status).toBe('pending');
    await testStore(database).nodeRuns.createOne({
      values: {
        workflowRunId: asIdFilter(run.id),
        nodeId: asIdFilter(workflow.nodes[0].id),
        nodeKey: 'hold',
        status: NODE_RUN_STATUS.PENDING,
        meta: serializeJson(null),
        result: serializeJson(null),
        startedAt: nowInstant(),
      },
    });
    expect(await wait.getPending(target)).toEqual({ status: 'ambiguous' });
    expect(
      await wait.resume({
        ...target,
        status: NODE_RUN_STATUS.RESOLVED,
        idempotencyKey: 'ambiguous',
      }),
    ).toEqual({ status: 'ambiguous' });
    await testStore(database).nodeRuns.updateMany({
      filter: { workflowRunId: asIdFilter(run.id), nodeKey: 'hold' },
      values: { status: NODE_RUN_STATUS.RESOLVED },
    });
    expect(await wait.getPending(target)).toEqual({ status: 'finished' });
    await testStore(database).runs.updateMany({
      filter: { id: asIdFilter(run.id) },
      values: { status: EXECUTION_STATUS.ABORTED },
    });
    expect(await wait.getPending(target)).toEqual({ status: 'run-ended' });
  });

  it('recovers a persisted decision after publication fails and ignores duplicate delivery', async () => {
    const { runId } = await start();
    const offline = new WaitInstructionApi({
      database,
      enqueue: async () => {
        throw new Error('queue offline');
      },
    });
    const receipt = await offline.resume({
      runId,
      nodeKey: 'await-payment',
      idempotencyKey: 'callback-offline',
      status: NODE_RUN_STATUS.RESOLVED,
      result: { paymentId: 'pay-1' },
    });
    expect(receipt.status).toBe('accepted');
    expect((await readRun(database, runId)).status).toBe(
      EXECUTION_STATUS.STARTED,
    );
    expect(await engine.dispatcher.recoverWaitRequests()).toBe(1);
    expect((await readRun(database, runId)).status).toBe(
      EXECUTION_STATUS.RESOLVED,
    );
    const nodeRuns = await listNodeRuns(database, runId);
    await engine.dispatch({
      executionId: runId,
      nodeRunId: (
        await testStore(database).nodeRuns.findOne({
          filter: {
            workflowRunId: asIdFilter(runId),
            nodeKey: 'await-payment',
          },
        })
      )?.id as number,
      waitRequestId: (receipt as { requestId: string }).requestId,
    });
    expect(await listNodeRuns(database, runId)).toEqual(nodeRuns);
  });

  it('continues a saved node decision after a worker exits before starting its successor', async () => {
    const { runId } = await start();
    const queued = new WaitInstructionApi({
      database,
      enqueue: async () => undefined,
    });
    const receipt = await queued.resume({
      runId,
      nodeKey: 'await-payment',
      idempotencyKey: 'crash-window',
      status: NODE_RUN_STATUS.RESOLVED,
      result: { paymentId: 'pay-1' },
    });
    if (receipt.status !== 'accepted') throw new Error('Decision not accepted');
    const request = await testStore(database).waitRequests.findOne({
      filter: { id: receipt.requestId },
    });
    if (!request) throw new Error('Request missing');
    await testStore(database).nodeRuns.updateMany({
      filter: { id: asIdFilter(request.nodeRunId as number) },
      values: {
        status: NODE_RUN_STATUS.RESOLVED,
        result: serializeJson({ paymentId: 'pay-1' }),
        finishedAt: nowInstant(),
      },
    });
    await engine.dispatch({
      executionId: runId,
      nodeRunId: request.nodeRunId as number,
      waitRequestId: receipt.requestId,
    });
    expect((await readRun(database, runId)).status).toBe(
      EXECUTION_STATUS.RESOLVED,
    );
    expect(
      (await listNodeRuns(database, runId)).filter(
        (node) => node.nodeKey === 'done',
      ),
    ).toHaveLength(1);
  });

  it('continues a saved wait at the end of a condition branch', async () => {
    const sourceRoot = await createModuleRoot({
      'branch/yes': 'export function run() { return true; }',
    });
    const branchEngine = new WorkflowEngine({
      database,
      timeoutReaper: false,
      developmentResourceRoot: sourceRoot,
      services: createWorkflowRunServices(new ServiceContainer()),
    });
    additionalEngines.push(branchEngine);
    await branchEngine.initialize();
    const definition = await createTestWorkflow(database, {
      key: 'branch',
      nodes: [
        {
          key: 'choice',
          type: 'condition',
          config: { module: './yes' },
          downstreamKey: 'done',
        },
        { key: 'hold', type: 'wait', upstreamKey: 'choice', branchKey: 'yes' },
        { key: 'done', type: 'terminate', upstreamKey: 'choice' },
      ],
    });
    const run = await branchEngine.trigger(definition, {});
    if (!run || !('id' in run)) throw new Error('No run');
    const queued = new WaitInstructionApi({
      database,
      enqueue: async () => undefined,
    });
    const receipt = await queued.resume({
      runId: run.id,
      nodeKey: 'hold',
      idempotencyKey: 'branch-crash',
      status: NODE_RUN_STATUS.RESOLVED,
    });
    if (receipt.status !== 'accepted') throw new Error('Decision not accepted');
    const request = await testStore(database).waitRequests.findOne({
      filter: { id: receipt.requestId },
    });
    if (!request) throw new Error('Request missing');
    await testStore(database).nodeRuns.updateMany({
      filter: { id: asIdFilter(request.nodeRunId as number) },
      values: { status: NODE_RUN_STATUS.RESOLVED, finishedAt: nowInstant() },
    });
    await branchEngine.dispatch({
      executionId: run.id,
      nodeRunId: request.nodeRunId as number,
      waitRequestId: receipt.requestId,
    });
    expect((await readRun(database, run.id)).status).toBe(
      EXECUTION_STATUS.RESOLVED,
    );
    expect(
      (await listNodeRuns(database, run.id)).filter(
        (node) => node.nodeKey === 'done',
      ),
    ).toHaveLength(1);
  });

  it('reclaims a request and run lease left by a stopped worker', async () => {
    const { runId } = await start();
    const queued = new WaitInstructionApi({
      database,
      enqueue: async () => undefined,
    });
    const receipt = await queued.resume({
      runId,
      nodeKey: 'await-payment',
      idempotencyKey: 'stale-worker',
      status: NODE_RUN_STATUS.RESOLVED,
    });
    if (receipt.status !== 'accepted') throw new Error('Decision not accepted');
    const stale = new Date(Date.now() - 360_000).toISOString();
    await testStore(database).waitRequests.updateMany({
      filter: { id: receipt.requestId },
      values: { state: 'processing', claimedAt: stale },
    });
    await testStore(database).runs.updateMany({
      filter: { id: asIdFilter(runId) },
      values: { waitLockToken: 'dead-worker', waitLockAt: stale },
    });
    expect(await engine.dispatcher.recoverWaitRequests()).toBe(1);
    expect((await readRun(database, runId)).status).toBe(
      EXECUTION_STATUS.RESOLVED,
    );
  });

  it('keeps the run bound to its original workflow revision', async () => {
    const { workflow, runId } = await start();
    await testStore(database).workflows.updateMany({
      filter: { id: asIdFilter(workflow.id) },
      values: { current: null, enabled: false },
    });
    await createTestWorkflow(database, {
      key: 'payment',
      nodes: [{ key: 'different', type: 'terminate' }],
    });
    expect(
      (
        await wait.resume({
          runId,
          nodeKey: 'await-payment',
          idempotencyKey: 'old-version',
          status: NODE_RUN_STATUS.RESOLVED,
          result: { paymentId: 'pay-1' },
        })
      ).status,
    ).toBe('accepted');
    expect((await readRun(database, runId)).status).toBe(
      EXECUTION_STATUS.RESOLVED,
    );
  });

  it('accepts one outstanding decision per node across concurrent submissions', async () => {
    const { runId } = await start();
    const queued = new WaitInstructionApi({
      database,
      enqueue: async () => undefined,
    });
    const outcomes = await Promise.all([
      queued.resume({
        runId,
        nodeKey: 'await-payment',
        idempotencyKey: 'a',
        status: NODE_RUN_STATUS.RESOLVED,
      }),
      queued.resume({
        runId,
        nodeKey: 'await-payment',
        idempotencyKey: 'b',
        status: NODE_RUN_STATUS.RESOLVED,
      }),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
      'accepted',
      'busy',
    ]);
    expect(await testStore(database).waitRequests.count()).toBe(1);
  });

  it('addresses two pending wait stages in one run by their distinct keys', async () => {
    const definition = await createTestWorkflow(database, {
      key: 'two-waits',
      nodes: [
        { key: 'left', type: 'wait' },
        { key: 'right', type: 'wait' },
      ],
    });
    const runId = await insertTestRun(database, {
      workflowId: definition.id,
      workflowKey: definition.key,
      eventKey: 'two-waits',
      status: EXECUTION_STATUS.STARTED,
      dispatched: true,
    });
    for (const node of definition.nodes) {
      await testStore(database).nodeRuns.createOne({
        values: {
          workflowRunId: asIdFilter(runId),
          nodeId: asIdFilter(node.id),
          nodeKey: node.key,
          status: NODE_RUN_STATUS.PENDING,
          meta: serializeJson(null),
          result: serializeJson(null),
          startedAt: nowInstant(),
        },
      });
    }
    const queued = new WaitInstructionApi({
      database,
      enqueue: async () => undefined,
    });
    const left = await queued.resume({
      runId,
      nodeKey: 'left',
      idempotencyKey: 'left-event',
      status: NODE_RUN_STATUS.RESOLVED,
    });
    const right = await queued.resume({
      runId,
      nodeKey: 'right',
      idempotencyKey: 'right-event',
      status: NODE_RUN_STATUS.RESOLVED,
    });
    expect([left.status, right.status]).toEqual(['accepted', 'accepted']);
    expect(await testStore(database).waitRequests.count()).toBe(2);
  });

  it('claims a queued request once across two runtime instances', async () => {
    const second = new WorkflowEngine({ database, timeoutReaper: false });
    additionalEngines.push(second);
    await second.initialize();
    const { runId } = await start();
    const queued = new WaitInstructionApi({
      database,
      enqueue: async () => undefined,
    });
    const receipt = await queued.resume({
      runId,
      nodeKey: 'await-payment',
      idempotencyKey: 'shared',
      status: NODE_RUN_STATUS.RESOLVED,
      result: { paymentId: 'pay-1' },
    });
    if (receipt.status !== 'accepted') throw new Error('Decision not accepted');
    const row = await testStore(database).nodeRuns.findOne({
      filter: { workflowRunId: asIdFilter(runId), nodeKey: 'await-payment' },
    });
    if (!row) throw new Error('Wait node missing');
    const task = {
      executionId: runId,
      nodeRunId: row.id as number,
      waitRequestId: receipt.requestId,
    };
    await Promise.all([engine.dispatch(task), second.dispatch(task)]);
    expect((await readRun(database, runId)).status).toBe(
      EXECUTION_STATUS.RESOLVED,
    );
    expect(
      (await listNodeRuns(database, runId)).filter(
        (node) => node.nodeKey === 'done',
      ),
    ).toHaveLength(1);
  });

  it('resumes through the database queue worker', async () => {
    await database
      .createMigrator({
        sources: [
          {
            ...queueMigrationSource,
            parameters: {
              jobsTable: 'queue_jobs',
              schedulesTable: 'queue_schedules',
            },
            configuration: [{ driver: 'database' }],
          },
        ],
      })
      .latest();
    const config: AppQueueConfig = {
      default: 'database',
      connections: {
        database: {
          driver: 'database',
          table: 'queue_jobs',
          schedulesTable: 'queue_schedules',
        },
      },
      worker: { queues: ['workflow'], concurrency: 1, idleDelay: '10ms' },
      jobs: { autoLoad: false, locations: [] },
    };
    queueManager = createQueueManager(config, { database });
    const queuedEngine = new WorkflowEngine({
      database,
      queue: queueManager,
      timeoutReaper: false,
    });
    additionalEngines.push(queuedEngine);
    await queuedEngine.initialize();
    const definition = await createTestWorkflow(database, {
      key: 'queued-wait',
      nodes: [
        { key: 'hold', type: 'wait', downstreamKey: 'done' },
        { key: 'done', type: 'terminate', upstreamKey: 'hold' },
      ],
    });
    const run = await queuedEngine.trigger(definition, {});
    if (!run || !('id' in run)) throw new Error('No run');
    const queuedWait = queuedEngine.getInstruction('wait');
    await waitFor(
      async () =>
        (await queuedWait.getPending({ runId: run.id, nodeKey: 'hold' }))
          .status === 'pending',
    );
    expect(
      (
        await queuedWait.resume({
          runId: run.id,
          nodeKey: 'hold',
          idempotencyKey: 'queue-callback',
          status: NODE_RUN_STATUS.RESOLVED,
        })
      ).status,
    ).toBe('accepted');
    await waitFor(
      async () =>
        (await readRun(database, run.id)).status === EXECUTION_STATUS.RESOLVED,
    );
    expect(
      (await listNodeRuns(database, run.id)).filter(
        (node) => node.nodeKey === 'done',
      ),
    ).toHaveLength(1);
  });

  it('rejects new decisions after expiry and discards an already queued one', async () => {
    const { runId } = await start();
    const queued = new WaitInstructionApi({
      database,
      enqueue: async () => undefined,
    });
    const receipt = await queued.resume({
      runId,
      nodeKey: 'await-payment',
      idempotencyKey: 'before-expiry',
      status: NODE_RUN_STATUS.RESOLVED,
    });
    if (receipt.status !== 'accepted') throw new Error('Decision not accepted');
    await testStore(database).runs.updateMany({
      filter: { id: asIdFilter(runId) },
      values: { expiresAt: new Date(Date.now() - 1000).toISOString() },
    });
    expect(await wait.getPending({ runId, nodeKey: 'await-payment' })).toEqual({
      status: 'run-ended',
    });
    const request = await testStore(database).waitRequests.findOne({
      filter: { id: receipt.requestId },
    });
    await engine.dispatch({
      executionId: runId,
      nodeRunId: request?.nodeRunId as number,
      waitRequestId: receipt.requestId,
    });
    expect(
      (
        await testStore(database).waitRequests.findOne({
          filter: { id: receipt.requestId },
        })
      )?.state,
    ).toBe('consumed');
    expect(
      (await listNodeRuns(database, runId)).filter(
        (node) => node.nodeKey === 'done',
      ),
    ).toHaveLength(0);
  });

  it('rejects oversized or invalid JSON before persisting a decision', async () => {
    const { runId } = await start();
    const target = {
      runId,
      nodeKey: 'await-payment',
      idempotencyKey: 'bad',
      status: NODE_RUN_STATUS.RESOLVED,
    };
    await expect(
      wait.resume({ ...target, result: { huge: 'x'.repeat(65_537) } }),
    ).rejects.toThrow('65536');
    await expect(
      wait.resume({ ...target, result: { value: Number.NaN } }),
    ).rejects.toThrow('JSON');
    expect(await testStore(database).waitRequests.count()).toBe(0);
  });
});
