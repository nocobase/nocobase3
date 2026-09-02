import { QueueSchemaService } from '@boringnode/queue';
import type { DatabaseManager } from '@nocobase/db';
import {
  createQueueManager,
  type AppQueueConfig,
  type NocoBaseQueueManager,
} from '@nocobase/queue';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKFLOW_COLLECTIONS } from '../server/collections/names.js';
import {
  EXECUTION_REASON,
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
} from '../server/engine/constants.js';
import WorkflowEngine from '../server/engine/engine.js';
import { loadWorkflow } from '../server/engine/utils.js';
import type {
  JsonObject,
  WorkflowId,
  WorkflowEngineOptions,
} from '../server/engine/types.js';
import type { WorkflowInstructionClass } from '../server/instructions/base.js';
import { ConditionInstruction } from '../server/instructions/condition/instruction.js';
import { WORKFLOW_QUEUE_NAME } from '../server/queue.js';
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

type RuntimeOverrides = Omit<Partial<WorkflowEngineOptions>, 'database'>;

function equals(path: string, right: unknown): JsonObject {
  return { expression: { '===': [{ var: path }, right] } };
}

function defineWorkflow(input: TestWorkflowInput): TestWorkflowInput {
  return input;
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
    worker: {
      queues: [WORKFLOW_QUEUE_NAME],
      concurrency: 1,
      idleDelay: '10ms',
    },
    jobs: { autoLoad: false, locations: [] },
  };
}

describe('workflow runtime', () => {
  let database: DatabaseManager;
  const runtimes: WorkflowEngine[] = [];
  let queueManager: NocoBaseQueueManager | null = null;

  function buildRuntime(
    instructions: Map<string, WorkflowInstructionClass>,
    overrides: RuntimeOverrides = {},
  ): WorkflowEngine {
    const runtime = new WorkflowEngine({
      database,
      ...overrides,
    });
    for (const instruction of instructions.values()) {
      runtime.registerInstruction(instruction);
    }
    runtimes.push(runtime);
    return runtime;
  }

  async function initializeRuntime(
    instructions: Map<string, WorkflowInstructionClass>,
    overrides: RuntimeOverrides = {},
  ): Promise<WorkflowEngine> {
    const runtime = buildRuntime(instructions, overrides);
    await runtime.initialize();
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
    const id = await database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.runs)
      .where('eventKey', '=', eventKey)
      .value<WorkflowId>('id');
    if (id == null) {
      throw new Error(`Run "${eventKey}" was not created`);
    }
    return id;
  }

  async function nodeRunIdOf(
    runId: WorkflowId,
    nodeKey: string,
  ): Promise<WorkflowId> {
    const id = await database
      .query()
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
    await Promise.allSettled(runtimes.map((runtime) => runtime.dispose()));
    runtimes.length = 0;
    await queueManager?.close();
    queueManager = null;
    await database.destroy();
  });

  describe('assembly', () => {
    it('uses one workflow-definition trigger interface for internal calls', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'invocation',
          nodes: [{ key: 'only', type: 'echo', config: { value: 'ok' } }],
        }),
      );
      await database
        .query()
        .updateTable(WORKFLOW_COLLECTIONS.workflows)
        .set({
          inputSchema: JSON.stringify({
            type: 'object',
            required: ['enabled'],
            properties: { enabled: { type: 'boolean' } },
            additionalProperties: false,
          }),
        })
        .where('id', '=', workflow.id)
        .execute();
      const runtime = buildRuntime(new Map([['echo', echoInstruction]]));
      await runtime.initialize();
      await runtime.trigger(
        { ...workflow, inputSchema: { type: 'object' } },
        { enabled: true },
        { eventKey: 'once' },
      );
      await expect(
        readRun(database, await runIdOf('once')),
      ).resolves.toMatchObject({
        workflowId: workflow.id,
        input: { enabled: true },
      });
    });

    it('pins revision, input and parameter snapshots before a new current revision appears', async () => {
      const first = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'pinned',
          nodes: [{ key: 'only', type: 'echo' }],
        }),
      );
      await database
        .query()
        .updateTable(WORKFLOW_COLLECTIONS.workflows)
        .set({
          inputSchema: JSON.stringify({
            type: 'object',
            required: ['falseValue', 'zero', 'empty', 'nested'],
            properties: {
              falseValue: { type: 'boolean' },
              zero: { type: 'number' },
              empty: { type: 'string' },
              nested: {
                type: 'object',
                properties: { value: { type: 'number' } },
              },
            },
          }),
          parametersSchema: JSON.stringify({
            limit: { type: 'number', default: 3 },
          }),
        })
        .where('id', '=', first.id)
        .execute();
      const runtime = await initializeRuntime(
        new Map([['echo', echoInstruction]]),
      );
      const context = {
        falseValue: false,
        zero: 0,
        empty: '',
        nested: { value: 0 },
      };
      const pinned = await loadWorkflow(database.query(), first.id);
      if (!pinned) throw new Error('Pinned workflow was not found');
      await runtime.trigger(pinned, context, { eventKey: 'pinned-event' });
      await database
        .query()
        .updateTable(WORKFLOW_COLLECTIONS.workflows)
        .set({ current: null })
        .where('id', '=', first.id)
        .execute();
      const second = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'pinned',
          nodes: [{ key: 'replacement', type: 'echo' }],
        }),
      );
      await database
        .query()
        .updateTable(WORKFLOW_COLLECTIONS.workflows)
        .set({
          parametersSchema: JSON.stringify({
            limit: { type: 'number', default: 9 },
          }),
        })
        .where('id', '=', second.id)
        .execute();
      const runId = await runIdOf('pinned-event');
      await expect(readRun(database, runId)).resolves.toMatchObject({
        workflowId: first.id,
        input: context,
        parameters: { limit: 3 },
      });
    });
    it('registers core and application instructions', () => {
      const runtime = buildRuntime(new Map([['echo', echoInstruction]]));
      expect(runtime.instructions.get('condition')).toBe(ConditionInstruction);
      expect(runtime.instructions.get('echo')).toBe(echoInstruction);
    });

    it('registers application instructions', async () => {
      const runtime = buildRuntime(new Map());

      runtime.registerInstruction(echoInstruction);
      expect(runtime.instructions.get('echo')).toBe(echoInstruction);
      expect(() => runtime.registerInstruction(echoInstruction)).toThrow(
        'Workflow instruction "echo" is already registered.',
      );

      await runtime.initialize();
      const slowInstruction = createSlowInstruction(1);
      expect(() => runtime.registerInstruction(slowInstruction)).not.toThrow();
      expect(runtime.instructions.get('slow')).toBe(slowInstruction);
    });

    it('drains in-flight work when disposed', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'draining',
          nodes: [{ key: 'slow', type: 'slow' }],
        }),
      );
      const runtime = buildRuntime(
        new Map([['slow', createSlowInstruction(60)]]),
      );
      await runtime.initialize();

      const runId = await insertTestRun(database, {
        workflowId: workflow.id,
        workflowKey: workflow.key,
        eventKey: 'drain-me',
      });
      // Not awaited on purpose: `dispose()` has to drain the dispatcher and
      // wait for it, otherwise the run is abandoned half-finished.
      void runtime.dispatch({ executionId: runId });
      await runtime.dispose();

      expect(runtime.idle).toBe(true);
      await expect(readRun(database, runId)).resolves.toMatchObject({
        status: EXECUTION_STATUS.RESOLVED,
      });
    });

    it('re-publishes runs a previous process left undispatched when it starts', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'recoverable',
          nodes: [
            { key: 'only', type: 'echo', config: { value: 'recovered' } },
          ],
        }),
      );
      const runId = await insertTestRun(database, {
        workflowId: workflow.id,
        workflowKey: workflow.key,
        eventKey: 'left-behind',
        createdAt: new Date(Date.now() - 60_000).toISOString(),
      });

      await initializeRuntime(new Map([['echo', echoInstruction]]));

      await expect(readRun(database, runId)).resolves.toMatchObject({
        status: EXECUTION_STATUS.RESOLVED,
        output: 'recovered',
      });
    });

    it('honours recoverGracePeriod so a run the previous process just created is left alone', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'too-fresh',
          nodes: [{ key: 'only', type: 'echo' }],
        }),
      );
      const runId = await insertTestRun(database, {
        workflowId: workflow.id,
        workflowKey: workflow.key,
        eventKey: 'fresh',
      });

      await initializeRuntime(new Map([['echo', echoInstruction]]), {
        recoverGracePeriod: 60_000,
      });

      await expect(readRun(database, runId)).resolves.toMatchObject({
        status: null,
      });
      await expect(listNodeRuns(database, runId)).resolves.toEqual([]);
    });

    it('manually executes a disabled workflow inline', async () => {
      const workflow = await createTestWorkflow(database, {
        key: 'manual-only',
        enabled: false,
        nodes: [{ key: 'only', type: 'echo', config: { value: 'manual' } }],
      });
      const runtime = await initializeRuntime(
        new Map([['echo', echoInstruction]]),
      );

      await runtime.trigger(
        workflow,
        {},
        { eventKey: 'by-hand', manually: true },
      );
      await expect(
        readRun(database, await runIdOf('by-hand')),
      ).resolves.toMatchObject({
        status: EXECUTION_STATUS.RESOLVED,
        output: 'manual',
      });
    });
  });

  describe('execution paths', () => {
    it('runs a linear sequence node by node', async () => {
      const trace: string[] = [];
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'linear',
          nodes: [
            { key: 'first', type: 'trace', downstreamKey: 'second' },
            {
              key: 'second',
              type: 'trace',
              upstreamKey: 'first',
              downstreamKey: 'third',
            },
            { key: 'third', type: 'trace', upstreamKey: 'second' },
          ],
        }),
      );
      const runtime = await initializeRuntime(
        new Map([['trace', createTraceInstruction(trace)]]),
      );

      await runtime.trigger(workflow, {}, { eventKey: 'linear-1' });

      const runId = await runIdOf('linear-1');
      expect(trace).toEqual(['first', 'second', 'third']);
      await expect(jobTrace(database, runId)).resolves.toEqual([
        'first',
        'second',
        'third',
      ]);
      await expect(readRun(database, runId)).resolves.toMatchObject({
        status: EXECUTION_STATUS.RESOLVED,
        output: 'third',
      });
    });

    it('enters the matching branch and comes back out to the common successor', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'branching',
          nodes: [
            {
              key: 'gate',
              type: 'condition',
              config: equals('input.mode', 'yes'),
              downstreamKey: 'after',
            },
            {
              key: 'yes1',
              type: 'trace',
              upstreamKey: 'gate',
              branchKey: 'yes',
              downstreamKey: 'yes2',
            },
            { key: 'yes2', type: 'trace', upstreamKey: 'yes1' },
            { key: 'no1', type: 'trace', upstreamKey: 'gate', branchKey: 'no' },
            { key: 'after', type: 'trace', upstreamKey: 'gate' },
          ],
        }),
      );
      const runtime = await initializeRuntime(
        new Map([['trace', createTraceInstruction([])]]),
      );

      await runtime.trigger(
        workflow,
        { mode: 'yes' },
        { eventKey: 'branch-yes' },
      );
      await runtime.trigger(
        workflow,
        { mode: 'no' },
        { eventKey: 'branch-no' },
      );

      // Recall completes the original condition nodeRun instead of appending one.
      await expect(
        jobTrace(database, await runIdOf('branch-yes')),
      ).resolves.toEqual(['gate', 'yes1', 'yes2', 'after']);
      await expect(
        jobTrace(database, await runIdOf('branch-no')),
      ).resolves.toEqual(['gate', 'no1', 'after']);
      await expect(
        readRun(database, await runIdOf('branch-no')),
      ).resolves.toMatchObject({
        status: EXECUTION_STATUS.RESOLVED,
        output: 'after',
      });
    });

    it('falls through to the common successor when the chosen branch is not declared', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'empty-branch',
          nodes: [
            {
              key: 'gate',
              type: 'condition',
              config: equals('input.mode', 'yes'),
              downstreamKey: 'after',
            },
            {
              key: 'yes1',
              type: 'trace',
              upstreamKey: 'gate',
              branchKey: 'yes',
            },
            { key: 'after', type: 'trace', upstreamKey: 'gate' },
          ],
        }),
      );
      const runtime = await initializeRuntime(
        new Map([['trace', createTraceInstruction([])]]),
      );

      await runtime.trigger(workflow, { mode: 'no' }, { eventKey: 'empty-no' });

      await expect(
        jobTrace(database, await runIdOf('empty-no')),
      ).resolves.toEqual(['gate', 'after']);
    });

    it('recalls through nested branches back to the outer common successor', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'nested',
          nodes: [
            { key: 'start', type: 'trace', downstreamKey: 'outer' },
            {
              key: 'outer',
              type: 'condition',
              config: equals('input.mode', 'yes'),
              upstreamKey: 'start',
              downstreamKey: 'tail',
            },
            {
              key: 'inner',
              type: 'condition',
              config: equals('input.deep', 'yes'),
              upstreamKey: 'outer',
              branchKey: 'yes',
            },
            {
              key: 'leaf1',
              type: 'trace',
              upstreamKey: 'inner',
              branchKey: 'yes',
              downstreamKey: 'leaf2',
            },
            { key: 'leaf2', type: 'trace', upstreamKey: 'leaf1' },
            { key: 'tail', type: 'trace', upstreamKey: 'outer' },
          ],
        }),
      );
      const runtime = await initializeRuntime(
        new Map([['trace', createTraceInstruction([])]]),
      );

      await runtime.trigger(
        workflow,
        { mode: 'yes', deep: 'yes' },
        { eventKey: 'nested-deep' },
      );
      await runtime.trigger(
        workflow,
        { mode: 'yes', deep: 'no' },
        { eventKey: 'nested-shallow' },
      );

      // Two levels of recall complete the existing inner and outer condition
      // nodeRuns in place, and only then does `tail` run.
      await expect(
        jobTrace(database, await runIdOf('nested-deep')),
      ).resolves.toEqual(['start', 'outer', 'inner', 'leaf1', 'leaf2', 'tail']);
      // The inner condition has no `no` branch and no downstream of its own, so
      // it ends the outer branch immediately.
      await expect(
        jobTrace(database, await runIdOf('nested-shallow')),
      ).resolves.toEqual(['start', 'outer', 'inner', 'tail']);
      await expect(
        readRun(database, await runIdOf('nested-deep')),
      ).resolves.toMatchObject({
        status: EXECUTION_STATUS.RESOLVED,
        output: 'tail',
      });
    });

    it('bubbles a failed branch nodeRun out through the parent condition and stops the run', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'failing-branch',
          nodes: [
            {
              key: 'gate',
              type: 'condition',
              config: {},
              downstreamKey: 'after',
            },
            { key: 'bad', type: 'fail', upstreamKey: 'gate', branchKey: 'yes' },
            { key: 'after', type: 'trace', upstreamKey: 'gate' },
          ],
        }),
      );
      const runtime = await initializeRuntime(
        new Map([
          ['trace', createTraceInstruction([])],
          ['fail', createFailingInstruction()],
        ]),
      );

      await runtime.trigger(workflow, {}, { eventKey: 'branch-fail' });

      const runId = await runIdOf('branch-fail');
      const nodeRuns = await listNodeRuns(database, runId);
      expect(nodeRuns.map((nodeRun) => nodeRun.nodeKey)).toEqual([
        'gate',
        'bad',
      ]);
      expect(
        nodeRuns.find((nodeRun) => nodeRun.nodeKey === 'gate'),
      ).toMatchObject({
        status: NODE_RUN_STATUS.FAILED,
        error: 'Condition node "gate" received an error from branch node "bad"',
      });
      expect(
        nodeRuns.find((nodeRun) => nodeRun.nodeKey === 'bad'),
      ).toMatchObject({
        status: NODE_RUN_STATUS.FAILED,
        error: 'Failed at bad',
      });
      await expect(readRun(database, runId)).resolves.toMatchObject({
        status: EXECUTION_STATUS.FAILED,
      });
    });

    it('records one contextual error per condition when a nested branch fails', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'nested-failing-branch',
          nodes: [
            { key: 'outer', type: 'condition', config: {} },
            {
              key: 'inner',
              type: 'condition',
              config: {},
              upstreamKey: 'outer',
              branchKey: 'yes',
            },
            {
              key: 'bad',
              type: 'fail',
              upstreamKey: 'inner',
              branchKey: 'yes',
            },
          ],
        }),
      );
      const runtime = await initializeRuntime(
        new Map([['fail', createFailingInstruction(NODE_RUN_STATUS.ERROR)]]),
      );

      await runtime.trigger(workflow, {}, { eventKey: 'nested-branch-fail' });

      const nodeRuns = await listNodeRuns(
        database,
        await runIdOf('nested-branch-fail'),
      );
      expect(
        nodeRuns.find((nodeRun) => nodeRun.nodeKey === 'bad'),
      ).toMatchObject({
        status: NODE_RUN_STATUS.ERROR,
        error: 'Failed at bad',
      });
      expect(
        nodeRuns.find((nodeRun) => nodeRun.nodeKey === 'inner'),
      ).toMatchObject({
        status: NODE_RUN_STATUS.ERROR,
        error:
          'Condition node "inner" received an error from branch node "bad"',
      });
      expect(
        nodeRuns.find((nodeRun) => nodeRun.nodeKey === 'outer'),
      ).toMatchObject({
        status: NODE_RUN_STATUS.ERROR,
        error:
          'Condition node "outer" received an error from branch node "inner"',
      });
    });

    it('suspends on a PENDING nodeRun and finishes when the nodeRun is dispatched again', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'suspending',
          nodes: [
            { key: 'before', type: 'trace', downstreamKey: 'hold' },
            {
              key: 'hold',
              type: 'pending',
              upstreamKey: 'before',
              downstreamKey: 'after',
            },
            { key: 'after', type: 'trace', upstreamKey: 'hold' },
          ],
        }),
      );
      const runtime = await initializeRuntime(
        new Map([
          ['trace', createTraceInstruction([])],
          ['pending', pendingInstruction],
        ]),
      );

      await runtime.trigger(workflow, {}, { eventKey: 'suspend-1' });
      const runId = await runIdOf('suspend-1');
      await expect(readRun(database, runId)).resolves.toMatchObject({
        status: EXECUTION_STATUS.STARTED,
      });
      await expect(jobTrace(database, runId)).resolves.toEqual([
        'before',
        'hold',
      ]);

      // What an external system does while the nodeRun waits: write the answer onto
      // the pending nodeRun, then hand the nodeRun back to the dispatcher.
      const nodeRunId = await nodeRunIdOf(runId, 'hold');
      await database
        .query()
        .updateTable(WORKFLOW_COLLECTIONS.nodeRuns)
        .set({ result: JSON.stringify('approved') })
        .where('id', '=', nodeRunId)
        .execute();

      await runtime.dispatcher.dispatch({ executionId: runId, nodeRunId });

      const nodeRuns = await listNodeRuns(database, runId);
      // `hold` keeps its original row: a resume updates the pending nodeRun in place.
      expect(nodeRuns.map((nodeRun) => nodeRun.nodeKey)).toEqual([
        'before',
        'hold',
        'after',
      ]);
      expect(nodeRuns[1]).toMatchObject({
        status: NODE_RUN_STATUS.RESOLVED,
        result: 'approved',
      });
      await expect(readRun(database, runId)).resolves.toMatchObject({
        status: EXECUTION_STATUS.RESOLVED,
      });
    });

    it('keeps a run started while a PENDING nodeRun waits inside a branch, then exits through the branch', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'suspending-branch',
          nodes: [
            {
              key: 'gate',
              type: 'condition',
              config: {},
              downstreamKey: 'after',
            },
            {
              key: 'hold',
              type: 'pending',
              upstreamKey: 'gate',
              branchKey: 'yes',
            },
            { key: 'after', type: 'trace', upstreamKey: 'gate' },
          ],
        }),
      );
      const runtime = await initializeRuntime(
        new Map([
          ['trace', createTraceInstruction([])],
          ['pending', pendingInstruction],
        ]),
      );

      await runtime.trigger(workflow, {}, { eventKey: 'suspend-branch' });
      const runId = await runIdOf('suspend-branch');
      const gateNodeRunId = await nodeRunIdOf(runId, 'gate');
      // Both the condition scope and its suspended branch node remain pending.
      await expect(readRun(database, runId)).resolves.toMatchObject({
        status: EXECUTION_STATUS.STARTED,
      });
      await expect(jobTrace(database, runId)).resolves.toEqual([
        'gate',
        'hold',
      ]);
      expect(
        (await listNodeRuns(database, runId)).find(
          (nodeRun) => nodeRun.nodeKey === 'gate',
        ),
      ).toMatchObject({ status: NODE_RUN_STATUS.PENDING });

      await runtime.dispatcher.dispatch({
        executionId: runId,
        nodeRunId: await nodeRunIdOf(runId, 'hold'),
      });

      await expect(jobTrace(database, runId)).resolves.toEqual([
        'gate',
        'hold',
        'after',
      ]);
      expect(await nodeRunIdOf(runId, 'gate')).toBe(gateNodeRunId);
      expect(
        (await listNodeRuns(database, runId)).find(
          (nodeRun) => nodeRun.nodeKey === 'gate',
        ),
      ).toMatchObject({ status: NODE_RUN_STATUS.RESOLVED });
      await expect(readRun(database, runId)).resolves.toMatchObject({
        status: EXECUTION_STATUS.RESOLVED,
      });
    });

    it('ends the run when a suspended main-flow nodeRun resumes with an error', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'resume-error',
          nodes: [
            { key: 'hold', type: 'error-resume', downstreamKey: 'after' },
            { key: 'after', type: 'trace', upstreamKey: 'hold' },
          ],
        }),
      );
      const runtime = await initializeRuntime(
        new Map([
          ['trace', createTraceInstruction([])],
          ['error-resume', errorResumeInstruction],
        ]),
      );

      await runtime.trigger(workflow, {}, { eventKey: 'resume-error-1' });
      const runId = await runIdOf('resume-error-1');
      await runtime.dispatcher.dispatch({
        executionId: runId,
        nodeRunId: await nodeRunIdOf(runId, 'hold'),
      });

      // `after` must not run: an errored resume ends the run where it stands.
      await expect(jobTrace(database, runId)).resolves.toEqual(['hold']);
      await expect(readRun(database, runId)).resolves.toMatchObject({
        status: EXECUTION_STATUS.ERROR,
      });
    });

    it('ends the run when a suspended nodeRun inside a branch resumes with an error', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'resume-error-branch',
          nodes: [
            {
              key: 'gate',
              type: 'condition',
              config: {},
              downstreamKey: 'after',
            },
            {
              key: 'hold',
              type: 'error-resume',
              upstreamKey: 'gate',
              branchKey: 'yes',
            },
            { key: 'after', type: 'trace', upstreamKey: 'gate' },
          ],
        }),
      );
      const runtime = await initializeRuntime(
        new Map([
          ['trace', createTraceInstruction([])],
          ['error-resume', errorResumeInstruction],
        ]),
      );

      await runtime.trigger(workflow, {}, { eventKey: 'resume-error-2' });
      const runId = await runIdOf('resume-error-2');
      await runtime.dispatcher.dispatch({
        executionId: runId,
        nodeRunId: await nodeRunIdOf(runId, 'hold'),
      });

      // The condition bubbles the errored branch status into its original nodeRun
      // instead of continuing to its downstream or appending a recall record.
      const nodeRuns = await listNodeRuns(database, runId);
      expect(nodeRuns.map((nodeRun) => nodeRun.nodeKey)).toEqual([
        'gate',
        'hold',
      ]);
      expect(
        nodeRuns.find((nodeRun) => nodeRun.nodeKey === 'gate'),
      ).toMatchObject({
        status: NODE_RUN_STATUS.ERROR,
        error:
          'Condition node "gate" received an error from branch node "hold"',
      });
      expect(
        nodeRuns.find((nodeRun) => nodeRun.nodeKey === 'hold'),
      ).toMatchObject({
        status: NODE_RUN_STATUS.ERROR,
        error: 'Resume failed',
      });
      await expect(readRun(database, runId)).resolves.toMatchObject({
        status: EXECUTION_STATUS.ERROR,
      });
    });
  });

  describe('queue round trip', () => {
    it('carries a triggered run through the database queue and back into the processor', async () => {
      const queue = await createQueue();
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'queued',
          nodes: [
            {
              key: 'only',
              type: 'echo',
              config: { value: 'through-the-queue' },
            },
          ],
        }),
      );
      const runtime = await initializeRuntime(
        new Map([['echo', echoInstruction]]),
        {
          queue,
        },
      );

      // Not synchronous, so `trigger()` only publishes; the worker does the work.
      await runtime.trigger(workflow, {}, { eventKey: 'queued-1' });
      const runId = await runIdOf('queued-1');

      await waitFor(
        async () =>
          (await readRun(database, runId)).status === EXECUTION_STATUS.RESOLVED,
      );
      await expect(readRun(database, runId)).resolves.toMatchObject({
        output: 'through-the-queue',
      });
    });

    it('picks up a task the previous process persisted but never consumed', async () => {
      const queue = await createQueue();
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'queued-restart',
          nodes: [
            { key: 'only', type: 'echo', config: { value: 'after-restart' } },
          ],
        }),
      );
      const runId = await insertTestRun(database, {
        workflowId: workflow.id,
        workflowKey: workflow.key,
        eventKey: 'queued-restart-1',
      });

      // A publisher-only process: it never starts a worker, so the task is still
      // in the queue table when the process goes away.
      const publisher = buildRuntime(new Map([['echo', echoInstruction]]), {
        queue,
      });
      await publisher.enqueue({ executionId: runId });
      await expect(
        database
          .query()
          .selectFrom(QUEUE_TABLE)
          .selectAll()
          .where('status', '=', 'pending')
          .execute(),
      ).resolves.toHaveLength(1);
      await publisher.dispose();

      await initializeRuntime(new Map([['echo', echoInstruction]]), { queue });
      await waitFor(
        async () =>
          (await readRun(database, runId)).status === EXECUTION_STATUS.RESOLVED,
      );
      await expect(readRun(database, runId)).resolves.toMatchObject({
        output: 'after-restart',
      });
    });
  });

  describe('timeout', () => {
    it('aborts a run that outlives its timeout while it is still executing', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'timing-out',
          options: { timeout: 0.03 },
          nodes: [{ key: 'slow', type: 'slow' }],
        }),
      );
      const runtime = await initializeRuntime(
        new Map([['slow', createSlowInstruction(300)]]),
        {
          timeoutReaper: false,
        },
      );

      await runtime.trigger(workflow, {}, { eventKey: 'timeout-live' });

      await expect(
        readRun(database, await runIdOf('timeout-live')),
      ).resolves.toMatchObject({
        status: EXECUTION_STATUS.ABORTED,
        reason: EXECUTION_REASON.TIMEOUT,
      });
    });

    it('reclaims a run a previous process left expired, once the reaper is running', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'expired',
          nodes: [{ key: 'hold', type: 'pending' }],
        }),
      );
      const runId = await insertTestRun(database, {
        workflowId: workflow.id,
        workflowKey: workflow.key,
        eventKey: 'expired-1',
        status: EXECUTION_STATUS.STARTED,
        dispatched: true,
        startedAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      await database
        .query()
        .insertInto(WORKFLOW_COLLECTIONS.nodeRuns)
        .values({
          workflowRunId: runId,
          nodeId: workflow.nodes[0].id,
          nodeKey: 'hold',
          status: NODE_RUN_STATUS.PENDING,
          meta: JSON.stringify(null),
          result: JSON.stringify(null),
          startedAt: new Date(Date.now() - 120_000).toISOString(),
        })
        .execute();

      await initializeRuntime(new Map([['pending', pendingInstruction]]), {
        timeoutReaperIntervalMs: 5,
      });

      await waitFor(
        async () =>
          (await readRun(database, runId)).status === EXECUTION_STATUS.ABORTED,
      );
      await expect(readRun(database, runId)).resolves.toMatchObject({
        reason: EXECUTION_REASON.TIMEOUT,
      });
      await expect(listNodeRuns(database, runId)).resolves.toEqual([
        {
          nodeKey: 'hold',
          status: NODE_RUN_STATUS.ABORTED,
          result: null,
          error: 'Workflow execution timed out',
        },
      ]);
    });

    it('exposes the sweep directly, and reports 0 when the reaper is switched off', async () => {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'sweepable',
          nodes: [{ key: 'only', type: 'echo' }],
        }),
      );
      await insertTestRun(database, {
        workflowId: workflow.id,
        workflowKey: workflow.key,
        eventKey: 'sweepable-1',
        status: EXECUTION_STATUS.STARTED,
        dispatched: true,
        startedAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });

      const disabled = buildRuntime(new Map([['echo', echoInstruction]]), {
        timeoutReaper: false,
      });
      await expect(disabled.sweepTimeouts()).resolves.toBe(0);

      const runtime = buildRuntime(new Map([['echo', echoInstruction]]));
      await expect(runtime.sweepTimeouts()).resolves.toBe(1);
      await expect(runtime.sweepTimeouts()).resolves.toBe(0);
    });
  });

  describe('rerun', () => {
    type SuspendedRun = {
      runtime: WorkflowEngine;
      runId: WorkflowId;
      counter: WorkflowInstructionClass & { readonly calls: () => number };
    };

    async function stageSuspendedRun(): Promise<SuspendedRun> {
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'rerunnable',
          nodes: [
            { key: 'counted', type: 'counter', downstreamKey: 'hold' },
            { key: 'hold', type: 'pending', upstreamKey: 'counted' },
          ],
        }),
      );
      const counter = createCounterInstruction();
      const runtime = await initializeRuntime(
        new Map([
          ['counter', counter],
          ['pending', pendingInstruction],
        ]),
      );
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

      await runtime.dispatcher.dispatch({
        executionId: runId,
        rerun: { nodeKey: 'counted' },
      });

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
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'stack-default',
          nodes: [{ key: 'only', type: 'echo' }],
        }),
      );
      const runtime = await initializeRuntime(
        new Map([['echo', echoInstruction]]),
      );

      await runtime.trigger(workflow, {}, { eventKey: 'stack-default-0' });
      const first = await runIdOf('stack-default-0');

      await expect(
        runtime.trigger(
          workflow,
          {},
          {
            eventKey: 'stack-default-1',
            parentRunId: first,
          },
        ),
      ).rejects.toThrow(/not valid/);

      // A run that is not on the stack does not count towards the limit.
      await runtime.trigger(workflow, {}, { eventKey: 'stack-default-2' });
      await expect(
        readRun(database, await runIdOf('stack-default-2')),
      ).resolves.toMatchObject({ status: EXECUTION_STATUS.RESOLVED });
    });

    it('allows nesting up to the configured stackLimit and rejects the one past it', async () => {
      const failures: unknown[] = [];
      const workflow = await createTestWorkflow(
        database,
        defineWorkflow({
          key: 'stack-limited',
          options: { stackLimit: 2 },
          nodes: [{ key: 'only', type: 'echo' }],
        }),
      );
      const runtime = await initializeRuntime(
        new Map([['echo', echoInstruction]]),
      );

      await runtime.trigger(workflow, {}, { eventKey: 'stack-0' });
      const first = await runIdOf('stack-0');
      await runtime.trigger(
        workflow,
        {},
        { eventKey: 'stack-1', parentRunId: first },
      );
      const second = await runIdOf('stack-1');
      await expect(readRun(database, second)).resolves.toMatchObject({
        stack: [first],
      });

      await expect(
        runtime.trigger(
          workflow,
          {},
          {
            eventKey: 'stack-2',
            parentRunId: second,
            onTriggerFail: (_workflow, _context, _options, error) => {
              failures.push(error);
            },
          },
        ),
      ).rejects.toThrow(/not valid/);

      expect(failures).toHaveLength(1);
      await expect(
        database
          .query()
          .selectFrom(WORKFLOW_COLLECTIONS.runs)
          .where('eventKey', '=', 'stack-2')
          .exists(),
      ).resolves.toBe(false);
    });
  });
});
