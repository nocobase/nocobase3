import { QueueSchemaService } from '@boringnode/queue';
import type { DatabaseManager } from '@nocobase/database';
import { createQueueManager, type AppQueueConfig, type NocoBaseQueueManager } from '@nocobase/queue';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  conditionInstruction,
  EXECUTION_REASON,
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
  customTrigger,
  WORKFLOW_COLLECTIONS,
  WORKFLOW_QUEUE_NAME,
  WorkflowRuntime,
  type JsonObject,
  type WorkflowId,
  type WorkflowInstruction,
  type WorkflowRuntimeOptions,
  type WorkflowTrigger,
} from '../src/index.js';
import {
  createCounterInstruction,
  createFailingInstruction,
  createSlowInstruction,
  createTraceInstruction,
  echoInstruction,
  errorResumeInstruction,
  pendingInstruction,
} from './fixtures/instructions.js';
import {
  createTestDatabase,
  createTestWorkflow,
  insertTestRun,
  jobTrace,
  listNodeRuns,
  readRun,
  waitFor,
  type TestWorkflowInput,
} from './helpers.js';

const QUEUE_TABLE = 'queue_jobs';
const SCHEDULES_TABLE = 'queue_schedules';

type RuntimeOverrides = Omit<Partial<WorkflowRuntimeOptions>, 'database' | 'instructions'>;

/** A trigger that accepts anything for tests of non-core event types. */
const openTrigger: WorkflowTrigger = {};

function equals(left: unknown, right: unknown): JsonObject {
  return { calculation: { calculator: 'equal', operands: [left, right] } };
}

function defineWorkflow(input: TestWorkflowInput): TestWorkflowInput {
  return { type: 'test', ...input };
}

function databaseQueueConfig(): AppQueueConfig {
  return {
    default: 'database',
    connections: {
      database: {
        driver: 'database',
        table: QUEUE_TABLE,
        schedulesTable: SCHEDULES_TABLE,
      },
    },
    worker: { queues: [WORKFLOW_QUEUE_NAME], concurrency: 1, idleDelay: '10ms' },
    jobs: { autoLoad: false, locations: [] },
  };
}

describe('workflow runtime', () => {
  let database: DatabaseManager;
  const runtimes: WorkflowRuntime[] = [];
  let queueManager: NocoBaseQueueManager | null = null;

  function buildRuntime(
    instructions: Map<string, WorkflowInstruction>,
    overrides: RuntimeOverrides = {},
  ): WorkflowRuntime {
    const runtime = new WorkflowRuntime({
      database,
      instructions,
      triggers: new Map([['test', openTrigger]]),
      ...overrides,
    });
    runtimes.push(runtime);
    return runtime;
  }

  async function startRuntime(
    instructions: Map<string, WorkflowInstruction>,
    overrides: RuntimeOverrides = {},
  ): Promise<WorkflowRuntime> {
    const runtime = buildRuntime(instructions, overrides);
    await runtime.start();
    return runtime;
  }

  async function createQueue(): Promise<NocoBaseQueueManager> {
    const connection = await database.connect();
    const client = await connection.client<Knex>();
    const schema = new QueueSchemaService(client);
    await schema.createJobsTable(QUEUE_TABLE);
    await schema.createSchedulesTable(SCHEDULES_TABLE);
    queueManager = createQueueManager(databaseQueueConfig(), { database });
    return queueManager;
  }

  async function runIdOf(eventKey: string): Promise<WorkflowId> {
    const id = await database.query()
      .selectFrom(WORKFLOW_COLLECTIONS.runs)
      .where('eventKey', '=', eventKey)
      .value<WorkflowId>('id');
    if (id == null) {
      throw new Error(`Run "${eventKey}" was not created`);
    }
    return id;
  }

  async function nodeRunIdOf(runId: WorkflowId, nodeKey: string): Promise<WorkflowId> {
    const id = await database.query()
      .selectFrom(WORKFLOW_COLLECTIONS.nodeRuns)
      .where('workflowRunId', '=', runId)
      .where('nodeKey', '=', nodeKey)
      .value<WorkflowId>('id');
    if (id == null) {
      throw new Error(`Node run of node "${nodeKey}" was not created`);
    }
    return id;
  }

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    // The queue adapter claims its queue name in a module-global registry, so a
    // failing test must not leak it into the next one.
    await Promise.allSettled(runtimes.map((runtime) => runtime.stop()));
    runtimes.length = 0;
    await queueManager?.close();
    queueManager = null;
    await database.destroy();
  });

  describe('assembly', () => {
    it('registers the core instructions and triggers, and lets the caller override them', () => {
      const runtime = buildRuntime(new Map([['echo', echoInstruction]]));
      expect(runtime.instructions.get('condition')).toBe(conditionInstruction);
      expect(runtime.instructions.get('echo')).toBe(echoInstruction);
      expect(runtime.triggers.get('custom')).toBe(customTrigger);
      expect(runtime.triggers.get('test')).toBe(openTrigger);

      const replacement: WorkflowTrigger = { validateEvent: () => false };
      const overriding = buildRuntime(new Map([['condition', echoInstruction]]), {
        triggers: new Map([['custom', replacement]]),
      });
      expect(overriding.instructions.get('condition')).toBe(echoInstruction);
      expect(overriding.triggers.get('custom')).toBe(replacement);
    });

    it('only accepts events between start() and stop()', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'gated',
        nodes: [{ key: 'only', type: 'echo', config: { value: 'ok' } }],
      }));
      const runtime = buildRuntime(new Map([['echo', echoInstruction]]));

      expect(runtime.started).toBe(false);
      await expect(runtime.trigger(workflow, {}, { eventKey: 'before' })).rejects.toThrow(/not ready/);

      await runtime.start();
      expect(runtime.started).toBe(true);
      await runtime.trigger(workflow, {}, { eventKey: 'during' });
      await expect(readRun(database, await runIdOf('during'))).resolves.toMatchObject({
        status: EXECUTION_STATUS.RESOLVED,
        output: 'ok',
      });

      await runtime.stop();
      expect(runtime.started).toBe(false);
      await expect(runtime.trigger(workflow, {}, { eventKey: 'after' })).rejects.toThrow(/not ready/);
    });

    it('is idempotent on start() and drains in-flight work on stop()', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'draining',
        nodes: [{ key: 'slow', type: 'slow' }],
      }));
      const runtime = buildRuntime(new Map([['slow', createSlowInstruction(60)]]));
      await runtime.start();
      await runtime.start();
      expect(runtime.started).toBe(true);

      const runId = await insertTestRun(database, {
        workflowId: workflow.id,
        workflowKey: workflow.key,
        eventKey: 'drain-me',
      });
      // Not awaited on purpose: `stop()` has to go through `beforeStop()` and
      // wait for it, otherwise the run is abandoned half-finished.
      void runtime.dispatch({ executionId: runId });
      await runtime.stop();
      await runtime.stop();

      expect(runtime.idle).toBe(false);
      await expect(readRun(database, runId)).resolves.toMatchObject({ status: EXECUTION_STATUS.RESOLVED });
    });

    it('re-publishes runs a previous process left undispatched when it starts', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'recoverable',
        nodes: [{ key: 'only', type: 'echo', config: { value: 'recovered' } }],
      }));
      const runId = await insertTestRun(database, {
        workflowId: workflow.id,
        workflowKey: workflow.key,
        eventKey: 'left-behind',
        createdAt: new Date(Date.now() - 60_000).toISOString(),
      });

      await startRuntime(new Map([['echo', echoInstruction]]));

      await expect(readRun(database, runId)).resolves.toMatchObject({
        status: EXECUTION_STATUS.RESOLVED,
        output: 'recovered',
      });
    });

    it('honours recoverGracePeriod so a run the previous process just created is left alone', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'too-fresh',
        nodes: [{ key: 'only', type: 'echo' }],
      }));
      const runId = await insertTestRun(database, {
        workflowId: workflow.id,
        workflowKey: workflow.key,
        eventKey: 'fresh',
      });

      await startRuntime(new Map([['echo', echoInstruction]]), { recoverGracePeriod: 60_000 });

      await expect(readRun(database, runId)).resolves.toMatchObject({ status: null });
      await expect(listNodeRuns(database, runId)).resolves.toEqual([]);
    });

    it('manually executes any workflow inline, even when disabled or its trigger is not registered', async () => {
      const workflow = await createTestWorkflow(database, {
        key: 'manual-only',
        type: 'not-registered',
        enabled: false,
        nodes: [{ key: 'only', type: 'echo', config: { value: 'manual' } }],
      });
      const runtime = await startRuntime(new Map([['echo', echoInstruction]]));

      await expect(runtime.trigger(workflow, {}, { eventKey: 'auto', force: true }))
        .rejects.toThrow(/not registered/);

      await runtime.trigger(workflow, {}, { eventKey: 'by-hand', manually: true });
      await expect(readRun(database, await runIdOf('by-hand'))).resolves.toMatchObject({
        status: EXECUTION_STATUS.RESOLVED,
        output: 'manual',
      });
    });
  });

  describe('execution paths', () => {
    it('runs a linear sequence node by node', async () => {
      const trace: string[] = [];
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'linear',
        nodes: [
          { key: 'first', type: 'trace', downstreamKey: 'second' },
          { key: 'second', type: 'trace', upstreamKey: 'first', downstreamKey: 'third' },
          { key: 'third', type: 'trace', upstreamKey: 'second' },
        ],
      }));
      const runtime = await startRuntime(new Map([['trace', createTraceInstruction(trace)]]));

      await runtime.trigger(workflow, {}, { eventKey: 'linear-1' });

      const runId = await runIdOf('linear-1');
      expect(trace).toEqual(['first', 'second', 'third']);
      await expect(jobTrace(database, runId)).resolves.toEqual(['first', 'second', 'third']);
      await expect(readRun(database, runId)).resolves.toMatchObject({
        status: EXECUTION_STATUS.RESOLVED,
        output: 'third',
      });
    });

    it('enters the matching branch and comes back out to the common successor', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'branching',
        nodes: [
          { key: 'gate', type: 'condition', config: equals('{{$context.mode}}', 'yes'), downstreamKey: 'after' },
          { key: 'yes1', type: 'trace', upstreamKey: 'gate', branchKey: 'yes', downstreamKey: 'yes2' },
          { key: 'yes2', type: 'trace', upstreamKey: 'yes1' },
          { key: 'no1', type: 'trace', upstreamKey: 'gate', branchKey: 'no' },
          { key: 'after', type: 'trace', upstreamKey: 'gate' },
        ],
      }));
      const runtime = await startRuntime(new Map([['trace', createTraceInstruction([])]]));

      await runtime.trigger(workflow, { mode: 'yes' }, { eventKey: 'branch-yes' });
      await runtime.trigger(workflow, { mode: 'no' }, { eventKey: 'branch-no' });

      // The second `gate` row is the recall: control came back out of the branch
      // and the condition decided what happens next.
      await expect(jobTrace(database, await runIdOf('branch-yes'))).resolves
        .toEqual(['gate', 'yes1', 'yes2', 'gate', 'after']);
      await expect(jobTrace(database, await runIdOf('branch-no'))).resolves
        .toEqual(['gate', 'no1', 'gate', 'after']);
      await expect(readRun(database, await runIdOf('branch-no'))).resolves
        .toMatchObject({ status: EXECUTION_STATUS.RESOLVED, output: 'after' });
    });

    it('falls through to the common successor when the chosen branch is not declared', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'empty-branch',
        nodes: [
          { key: 'gate', type: 'condition', config: equals('{{$context.mode}}', 'yes'), downstreamKey: 'after' },
          { key: 'yes1', type: 'trace', upstreamKey: 'gate', branchKey: 'yes' },
          { key: 'after', type: 'trace', upstreamKey: 'gate' },
        ],
      }));
      const runtime = await startRuntime(new Map([['trace', createTraceInstruction([])]]));

      await runtime.trigger(workflow, { mode: 'no' }, { eventKey: 'empty-no' });

      await expect(jobTrace(database, await runIdOf('empty-no'))).resolves.toEqual(['gate', 'after']);
    });

    it('recalls through nested branches back to the outer common successor', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'nested',
        nodes: [
          { key: 'start', type: 'trace', downstreamKey: 'outer' },
          {
            key: 'outer',
            type: 'condition',
            config: equals('{{$context.mode}}', 'yes'),
            upstreamKey: 'start',
            downstreamKey: 'tail',
          },
          {
            key: 'inner',
            type: 'condition',
            config: equals('{{$context.deep}}', 'yes'),
            upstreamKey: 'outer',
            branchKey: 'yes',
          },
          { key: 'leaf1', type: 'trace', upstreamKey: 'inner', branchKey: 'yes', downstreamKey: 'leaf2' },
          { key: 'leaf2', type: 'trace', upstreamKey: 'leaf1' },
          { key: 'tail', type: 'trace', upstreamKey: 'outer' },
        ],
      }));
      const runtime = await startRuntime(new Map([['trace', createTraceInstruction([])]]));

      await runtime.trigger(workflow, { mode: 'yes', deep: 'yes' }, { eventKey: 'nested-deep' });
      await runtime.trigger(workflow, { mode: 'yes', deep: 'no' }, { eventKey: 'nested-shallow' });

      // Two levels of recall: `leaf2` ends the inner branch, the recalled inner
      // condition then ends the outer branch, and only then does `tail` run.
      await expect(jobTrace(database, await runIdOf('nested-deep'))).resolves
        .toEqual(['start', 'outer', 'inner', 'leaf1', 'leaf2', 'inner', 'outer', 'tail']);
      // The inner condition has no `no` branch and no downstream of its own, so
      // it ends the outer branch immediately.
      await expect(jobTrace(database, await runIdOf('nested-shallow'))).resolves
        .toEqual(['start', 'outer', 'inner', 'outer', 'tail']);
      await expect(readRun(database, await runIdOf('nested-deep'))).resolves
        .toMatchObject({ status: EXECUTION_STATUS.RESOLVED, output: 'tail' });
    });

    it('bubbles a failed branch nodeRun out through the parent condition and stops the run', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'failing-branch',
        nodes: [
          { key: 'gate', type: 'condition', config: {}, downstreamKey: 'after' },
          { key: 'bad', type: 'fail', upstreamKey: 'gate', branchKey: 'yes' },
          { key: 'after', type: 'trace', upstreamKey: 'gate' },
        ],
      }));
      const runtime = await startRuntime(new Map([
        ['trace', createTraceInstruction([])],
        ['fail', createFailingInstruction()],
      ]));

      await runtime.trigger(workflow, {}, { eventKey: 'branch-fail' });

      const runId = await runIdOf('branch-fail');
      const nodeRuns = await listNodeRuns(database, runId);
      expect(nodeRuns.map((nodeRun) => nodeRun.nodeKey)).toEqual(['gate', 'bad', 'gate']);
      expect(nodeRuns.at(-1)).toMatchObject({ status: NODE_RUN_STATUS.FAILED });
      await expect(readRun(database, runId)).resolves.toMatchObject({ status: EXECUTION_STATUS.FAILED });
    });

    it('suspends on a PENDING nodeRun and finishes when the nodeRun is dispatched again', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'suspending',
        nodes: [
          { key: 'before', type: 'trace', downstreamKey: 'hold' },
          { key: 'hold', type: 'pending', upstreamKey: 'before', downstreamKey: 'after' },
          { key: 'after', type: 'trace', upstreamKey: 'hold' },
        ],
      }));
      const runtime = await startRuntime(new Map([
        ['trace', createTraceInstruction([])],
        ['pending', pendingInstruction],
      ]));

      await runtime.trigger(workflow, {}, { eventKey: 'suspend-1' });
      const runId = await runIdOf('suspend-1');
      await expect(readRun(database, runId)).resolves.toMatchObject({ status: EXECUTION_STATUS.STARTED });
      await expect(jobTrace(database, runId)).resolves.toEqual(['before', 'hold']);

      // What an external system does while the nodeRun waits: write the answer onto
      // the pending nodeRun, then hand the nodeRun back to the dispatcher.
      const nodeRunId = await nodeRunIdOf(runId, 'hold');
      await database.query()
        .updateTable(WORKFLOW_COLLECTIONS.nodeRuns)
        .set({ result: JSON.stringify('approved') })
        .where('id', '=', nodeRunId)
        .execute();

      await runtime.dispatcher.dispatch({ executionId: runId, nodeRunId });

      const nodeRuns = await listNodeRuns(database, runId);
      // `hold` keeps its original row: a resume updates the pending nodeRun in place.
      expect(nodeRuns.map((nodeRun) => nodeRun.nodeKey)).toEqual(['before', 'hold', 'after']);
      expect(nodeRuns[1]).toMatchObject({ status: NODE_RUN_STATUS.RESOLVED, result: 'approved' });
      await expect(readRun(database, runId)).resolves.toMatchObject({ status: EXECUTION_STATUS.RESOLVED });
    });

    it('keeps a run started while a PENDING nodeRun waits inside a branch, then exits through the branch', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'suspending-branch',
        nodes: [
          { key: 'gate', type: 'condition', config: {}, downstreamKey: 'after' },
          { key: 'hold', type: 'pending', upstreamKey: 'gate', branchKey: 'yes' },
          { key: 'after', type: 'trace', upstreamKey: 'gate' },
        ],
      }));
      const runtime = await startRuntime(new Map([
        ['trace', createTraceInstruction([])],
        ['pending', pendingInstruction],
      ]));

      await runtime.trigger(workflow, {}, { eventKey: 'suspend-branch' });
      const runId = await runIdOf('suspend-branch');
      // The condition was recalled with a PENDING branch nodeRun and returned null,
      // which must leave the persisted status untouched.
      await expect(readRun(database, runId)).resolves.toMatchObject({ status: EXECUTION_STATUS.STARTED });
      await expect(jobTrace(database, runId)).resolves.toEqual(['gate', 'hold']);

      await runtime.dispatcher.dispatch({ executionId: runId, nodeRunId: await nodeRunIdOf(runId, 'hold') });

      await expect(jobTrace(database, runId)).resolves.toEqual(['gate', 'hold', 'gate', 'after']);
      await expect(readRun(database, runId)).resolves.toMatchObject({ status: EXECUTION_STATUS.RESOLVED });
    });

    it('ends the run when a suspended main-flow nodeRun resumes with an error', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'resume-error',
        nodes: [
          { key: 'hold', type: 'error-resume', downstreamKey: 'after' },
          { key: 'after', type: 'trace', upstreamKey: 'hold' },
        ],
      }));
      const runtime = await startRuntime(new Map([
        ['trace', createTraceInstruction([])],
        ['error-resume', errorResumeInstruction],
      ]));

      await runtime.trigger(workflow, {}, { eventKey: 'resume-error-1' });
      const runId = await runIdOf('resume-error-1');
      await runtime.dispatcher.dispatch({ executionId: runId, nodeRunId: await nodeRunIdOf(runId, 'hold') });

      // `after` must not run: an errored resume ends the run where it stands.
      await expect(jobTrace(database, runId)).resolves.toEqual(['hold']);
      await expect(readRun(database, runId)).resolves.toMatchObject({ status: EXECUTION_STATUS.ERROR });
    });

    it('ends the run when a suspended nodeRun inside a branch resumes with an error', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'resume-error-branch',
        nodes: [
          { key: 'gate', type: 'condition', config: {}, downstreamKey: 'after' },
          { key: 'hold', type: 'error-resume', upstreamKey: 'gate', branchKey: 'yes' },
          { key: 'after', type: 'trace', upstreamKey: 'gate' },
        ],
      }));
      const runtime = await startRuntime(new Map([
        ['trace', createTraceInstruction([])],
        ['error-resume', errorResumeInstruction],
      ]));

      await runtime.trigger(workflow, {}, { eventKey: 'resume-error-2' });
      const runId = await runIdOf('resume-error-2');
      await runtime.dispatcher.dispatch({ executionId: runId, nodeRunId: await nodeRunIdOf(runId, 'hold') });

      // The condition bubbles the errored branch status up instead of continuing
      // to its own downstream. The third row is the recall — the v2 engine
      // mutated the condition's first nodeRun instead of appending one, so the same
      // path produced two rows there and produces three here.
      const nodeRuns = await listNodeRuns(database, runId);
      expect(nodeRuns.map((nodeRun) => nodeRun.nodeKey)).toEqual(['gate', 'hold', 'gate']);
      expect(nodeRuns.at(-1)).toMatchObject({ status: NODE_RUN_STATUS.ERROR });
      await expect(readRun(database, runId)).resolves.toMatchObject({ status: EXECUTION_STATUS.ERROR });
    });
  });

  describe('queue round trip', () => {
    it('carries a triggered run through the database queue and back into the processor', async () => {
      const queue = await createQueue();
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'queued',
        nodes: [{ key: 'only', type: 'echo', config: { value: 'through-the-queue' } }],
      }));
      const runtime = await startRuntime(new Map([['echo', echoInstruction]]), { queue });

      // Not synchronous, so `trigger()` only publishes; the worker does the work.
      await runtime.trigger(workflow, {}, { eventKey: 'queued-1' });
      const runId = await runIdOf('queued-1');

      await waitFor(async () => (await readRun(database, runId)).status === EXECUTION_STATUS.RESOLVED);
      await expect(readRun(database, runId)).resolves.toMatchObject({ output: 'through-the-queue' });
    });

    it('picks up a task the previous process persisted but never consumed', async () => {
      const queue = await createQueue();
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'queued-restart',
        nodes: [{ key: 'only', type: 'echo', config: { value: 'after-restart' } }],
      }));
      const runId = await insertTestRun(database, {
        workflowId: workflow.id,
        workflowKey: workflow.key,
        eventKey: 'queued-restart-1',
      });

      // A publisher-only process: it never starts a worker, so the task is still
      // in the queue table when the process goes away.
      const publisher = buildRuntime(new Map([['echo', echoInstruction]]), { queue });
      await publisher.enqueue({ executionId: runId });
      await expect(database.query()
        .selectFrom(QUEUE_TABLE)
        .selectAll()
        .where('status', '=', 'pending')
        .execute()).resolves.toHaveLength(1);
      await publisher.stop();

      const consumer = await startRuntime(new Map([['echo', echoInstruction]]), { queue });
      expect(consumer.started).toBe(true);

      await waitFor(async () => (await readRun(database, runId)).status === EXECUTION_STATUS.RESOLVED);
      await expect(readRun(database, runId)).resolves.toMatchObject({ output: 'after-restart' });
    });
  });

  describe('timeout', () => {
    it('aborts a run that outlives its timeout while it is still executing', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'timing-out',
        options: { timeout: 0.03 },
        nodes: [{ key: 'slow', type: 'slow' }],
      }));
      const runtime = await startRuntime(new Map([['slow', createSlowInstruction(300)]]), {
        timeoutReaper: false,
      });

      await runtime.trigger(workflow, {}, { eventKey: 'timeout-live' });

      await expect(readRun(database, await runIdOf('timeout-live'))).resolves.toMatchObject({
        status: EXECUTION_STATUS.ABORTED,
        reason: EXECUTION_REASON.TIMEOUT,
      });
    });

    it('reclaims a run a previous process left expired, once the reaper is running', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'expired',
        nodes: [{ key: 'hold', type: 'pending' }],
      }));
      const runId = await insertTestRun(database, {
        workflowId: workflow.id,
        workflowKey: workflow.key,
        eventKey: 'expired-1',
        status: EXECUTION_STATUS.STARTED,
        dispatched: true,
        startedAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      await database.query().insertInto(WORKFLOW_COLLECTIONS.nodeRuns).values({
        workflowRunId: runId,
        nodeId: workflow.nodes[0].id,
        nodeKey: 'hold',
        status: NODE_RUN_STATUS.PENDING,
        meta: JSON.stringify(null),
        result: JSON.stringify(null),
        startedAt: new Date(Date.now() - 120_000).toISOString(),
      }).execute();

      await startRuntime(new Map([['pending', pendingInstruction]]), { timeoutReaperIntervalMs: 5 });

      await waitFor(async () => (await readRun(database, runId)).status === EXECUTION_STATUS.ABORTED);
      await expect(readRun(database, runId)).resolves.toMatchObject({ reason: EXECUTION_REASON.TIMEOUT });
      await expect(listNodeRuns(database, runId)).resolves
        .toEqual([{ nodeKey: 'hold', status: NODE_RUN_STATUS.ABORTED, result: null }]);
    });

    it('exposes the sweep directly, and reports 0 when the reaper is switched off', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'sweepable',
        nodes: [{ key: 'only', type: 'echo' }],
      }));
      await insertTestRun(database, {
        workflowId: workflow.id,
        workflowKey: workflow.key,
        eventKey: 'sweepable-1',
        status: EXECUTION_STATUS.STARTED,
        dispatched: true,
        startedAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });

      const disabled = buildRuntime(new Map([['echo', echoInstruction]]), { timeoutReaper: false });
      await expect(disabled.sweepTimeouts()).resolves.toBe(0);

      const runtime = buildRuntime(new Map([['echo', echoInstruction]]));
      await expect(runtime.sweepTimeouts()).resolves.toBe(1);
      await expect(runtime.sweepTimeouts()).resolves.toBe(0);
    });
  });

  describe('rerun', () => {
    type SuspendedRun = {
      runtime: WorkflowRuntime;
      runId: WorkflowId;
      counter: WorkflowInstruction & { readonly calls: () => number };
    };

    async function stageSuspendedRun(): Promise<SuspendedRun> {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'rerunnable',
        nodes: [
          { key: 'counted', type: 'counter', downstreamKey: 'hold' },
          { key: 'hold', type: 'pending', upstreamKey: 'counted' },
        ],
      }));
      const counter = createCounterInstruction();
      const runtime = await startRuntime(new Map([
        ['counter', counter],
        ['pending', pendingInstruction],
      ]));
      await runtime.trigger(workflow, {}, { eventKey: 'rerun-1' });
      const runId = await runIdOf('rerun-1');
      // A re-run only applies to a run that is still STARTED, which is what the
      // pending node keeps it as.
      await expect(listNodeRuns(database, runId)).resolves.toEqual([
        { nodeKey: 'counted', status: NODE_RUN_STATUS.RESOLVED, result: 1 },
        { nodeKey: 'hold', status: NODE_RUN_STATUS.PENDING, result: null },
      ]);
      return { runtime, runId, counter };
    }

    it('appends a new nodeRun when a node is re-run without overwrite', async () => {
      const { runtime, runId, counter } = await stageSuspendedRun();

      await runtime.dispatcher.dispatch({ executionId: runId, rerun: { nodeKey: 'counted' } });

      expect(counter.calls()).toBe(2);
      await expect(listNodeRuns(database, runId)).resolves.toEqual([
        { nodeKey: 'counted', status: NODE_RUN_STATUS.RESOLVED, result: 1 },
        { nodeKey: 'hold', status: NODE_RUN_STATUS.PENDING, result: null },
        { nodeKey: 'counted', status: NODE_RUN_STATUS.RESOLVED, result: 2 },
        { nodeKey: 'hold', status: NODE_RUN_STATUS.PENDING, result: null },
      ]);
    });

    it('replaces the target nodeRun when a node is re-run with overwrite', async () => {
      const { runtime, runId } = await stageSuspendedRun();

      await runtime.dispatcher.dispatch({
        executionId: runId,
        rerun: { nodeKey: 'counted', overwrite: true },
      });

      // Only the node named by the re-run is overwritten; nodes downstream of it
      // still append, because their repetition is what a re-run is meant to show.
      await expect(listNodeRuns(database, runId)).resolves.toEqual([
        { nodeKey: 'counted', status: NODE_RUN_STATUS.RESOLVED, result: 2 },
        { nodeKey: 'hold', status: NODE_RUN_STATUS.PENDING, result: null },
        { nodeKey: 'hold', status: NODE_RUN_STATUS.PENDING, result: null },
      ]);
    });
  });

  describe('stack limit', () => {
    it('rejects a nested trigger beyond the default stackLimit of 1', async () => {
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'stack-default',
        nodes: [{ key: 'only', type: 'echo' }],
      }));
      const runtime = await startRuntime(new Map([['echo', echoInstruction]]));

      await runtime.trigger(workflow, {}, { eventKey: 'stack-default-0' });
      const first = await runIdOf('stack-default-0');

      await expect(runtime.trigger(workflow, {}, {
        eventKey: 'stack-default-1',
        parentExecutionId: first,
      })).rejects.toThrow(/not valid/);

      // A run that is not on the stack does not count towards the limit.
      await runtime.trigger(workflow, {}, { eventKey: 'stack-default-2' });
      await expect(readRun(database, await runIdOf('stack-default-2'))).resolves
        .toMatchObject({ status: EXECUTION_STATUS.RESOLVED });
    });

    it('allows nesting up to the configured stackLimit and rejects the one past it', async () => {
      const failures: unknown[] = [];
      const workflow = await createTestWorkflow(database, defineWorkflow({
        key: 'stack-limited',
        options: { stackLimit: 2 },
        nodes: [{ key: 'only', type: 'echo' }],
      }));
      const runtime = await startRuntime(new Map([['echo', echoInstruction]]));

      await runtime.trigger(workflow, {}, { eventKey: 'stack-0' });
      const first = await runIdOf('stack-0');
      await runtime.trigger(workflow, {}, { eventKey: 'stack-1', parentExecutionId: first });
      const second = await runIdOf('stack-1');
      await expect(readRun(database, second)).resolves.toMatchObject({ stack: [first] });

      await expect(runtime.trigger(workflow, {}, {
        eventKey: 'stack-2',
        parentExecutionId: second,
        onTriggerFail: (_workflow, _context, _options, error) => {
          failures.push(error);
        },
      })).rejects.toThrow(/not valid/);

      expect(failures).toHaveLength(1);
      await expect(database.query()
        .selectFrom(WORKFLOW_COLLECTIONS.runs)
        .where('eventKey', '=', 'stack-2')
        .exists()).resolves.toBe(false);
    });
  });
});
