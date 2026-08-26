import {
  createDatabaseManager,
  type DatabaseManager,
  type Row,
} from '@nocobase/app-database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKFLOW_COLLECTIONS } from '../server/collections/names.js';
import {
  EXECUTION_REASON,
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
} from '../server/engine/constants.js';
import Dispatcher from '../server/engine/dispatcher.js';
import Processor from '../server/engine/processor.js';
import type {
  WorkflowDefinition,
  WorkflowId,
  WorkflowNode,
} from '../server/engine/types.js';
import { loadWorkflow } from '../server/engine/utils.js';
import type { WorkflowInstructionClass } from '../server/instructions/base.js';
import { ConditionInstruction } from '../server/instructions/condition/instruction.js';
import { createWorkflowCollections } from './helpers.js';
import {
  defineTestInstruction,
  echoInstruction,
} from './fixtures/instructions.js';
import {
  createTestDatabase,
  createTestWorkflow,
  insertTestRun,
  listNodeRuns,
  readRun,
} from './helpers.js';

describe('workflow dispatcher and processor', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });
    await createWorkflowCollections(database.builder());
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('dispatches and processes nodes connected only by upstreamKey and downstreamKey', async () => {
    await database
      .query()
      .insertInto(WORKFLOW_COLLECTIONS.workflows)
      .values({
        key: 'key-topology',
        title: 'Key topology',
        enabled: true,
        current: true,
        contextSchema: { type: 'object' },
        inputSchema: {},
        inputValues: {},
        options: {},
      })
      .execute();
    const workflowRow = await database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .select('id')
      .where('key', '=', 'key-topology')
      .executeTakeFirstOrThrow<Row>();
    const workflowId = workflowRow.id;

    await database
      .query()
      .insertInto(WORKFLOW_COLLECTIONS.nodes)
      .values([
        {
          workflowId,
          key: 'first',
          type: 'echo',
          config: JSON.stringify({ value: 1 }),
          upstreamKey: null,
          downstreamKey: 'second',
          branchKey: null,
        },
        {
          workflowId,
          key: 'second',
          type: 'echo',
          config: JSON.stringify({ value: 2 }),
          upstreamKey: 'first',
          downstreamKey: null,
          branchKey: null,
        },
      ])
      .execute();

    const echo: WorkflowInstructionClass = defineTestInstruction(
      'echo',
      async (instruction) => ({
        status: NODE_RUN_STATUS.RESOLVED,
        result: instruction.node.config.value,
      }),
    );
    const workflow = await loadWorkflow(
      database.query(),
      workflowId as string | number,
    );
    expect(workflow).not.toBeNull();

    const dispatcher = new Dispatcher({
      database,
      instructions: new Map([['echo', echo]]),
    });
    await dispatcher.trigger(
      workflow!,
      { orderId: 10 },
      { eventKey: 'event-key-topology' },
    );

    const execution = await database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.runs)
      .selectAll()
      .where('eventKey', '=', 'event-key-topology')
      .executeTakeFirstOrThrow<Row>();
    expect(execution.status).toBe(EXECUTION_STATUS.RESOLVED);
    expect(execution.output).toBe(2);

    const nodeRuns = await database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.nodeRuns)
      .select(['nodeKey', 'status', 'result'])
      .where('workflowRunId', '=', execution.id)
      .orderBy('id')
      .execute<Row>();
    expect(nodeRuns).toEqual([
      { nodeKey: 'first', status: NODE_RUN_STATUS.RESOLVED, result: 1 },
      { nodeKey: 'second', status: NODE_RUN_STATUS.RESOLVED, result: 2 },
    ]);
  });

  it('recovers an undispatched execution through the same key-based processor path', async () => {
    await database
      .query()
      .insertInto(WORKFLOW_COLLECTIONS.workflows)
      .values({
        key: 'recoverable',
        enabled: true,
        current: true,
        contextSchema: { type: 'object' },
        inputSchema: {},
        inputValues: {},
        options: {},
      })
      .execute();
    const workflowId = await database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .where('key', '=', 'recoverable')
      .value<string | number>('id');
    await database
      .query()
      .insertInto(WORKFLOW_COLLECTIONS.nodes)
      .values({
        workflowId,
        key: 'only',
        type: 'echo',
        config: JSON.stringify({}),
        upstreamKey: null,
        downstreamKey: null,
        branchKey: null,
      })
      .execute();
    await database
      .query()
      .insertInto(WORKFLOW_COLLECTIONS.runs)
      .values({
        workflowId,
        workflowKey: 'recoverable',
        eventKey: 'recover-event',
        context: JSON.stringify({}),
        input: JSON.stringify({}),
        status: null,
        dispatched: false,
        stack: JSON.stringify([]),
        createdAt: new Date(0).toISOString(),
        manually: false,
      })
      .execute();

    const dispatcher = new Dispatcher({
      database,
      instructions: new Map([
        [
          'echo',
          defineTestInstruction('echo', async () => ({
            status: NODE_RUN_STATUS.RESOLVED,
            result: 'recovered',
          })),
        ],
      ]),
    });
    await expect(dispatcher.recover()).resolves.toBe(1);

    await expect(
      database
        .query()
        .selectFrom(WORKFLOW_COLLECTIONS.runs)
        .where('eventKey', '=', 'recover-event')
        .value('status'),
    ).resolves.toBe(EXECUTION_STATUS.RESOLVED);
  });
});

/**
 * Direct coverage of the `Processor` surface.
 *
 * The integration test exercises these through whole runs; this block calls the
 * public methods one by one, so a regression points at the method instead of at
 * a path that happens to use it.
 */
describe('Processor public API', () => {
  let database: DatabaseManager;
  let workflow: WorkflowDefinition;
  let runCounter = 0;

  const instructions = new Map<string, WorkflowInstructionClass>([
    ['condition', ConditionInstruction],
    ['echo', echoInstruction],
  ]);

  function nodeOf(key: string): WorkflowNode {
    const node = workflow.nodes.find((candidate) => candidate.key === key);
    if (!node) {
      throw new Error(`Node "${key}" is missing from the fixture`);
    }
    return node;
  }

  async function createProcessor(
    target: WorkflowDefinition = workflow,
  ): Promise<{ processor: Processor; runId: WorkflowId }> {
    runCounter += 1;
    const runId = await insertTestRun(database, {
      workflowId: target.id,
      workflowKey: target.key,
      eventKey: `processor-${runCounter}`,
      status: EXECUTION_STATUS.STARTED,
      dispatched: true,
      startedAt: new Date().toISOString(),
      context: { amount: 7 },
    });
    const execution = await readRun(database, runId);
    // A fresh definition per processor: `prepare()` links `upstream` /
    // `downstream` on the node objects themselves.
    const definition = await loadWorkflow(database.query(), target.id);
    if (!definition) {
      throw new Error('Workflow was not reloaded');
    }
    const processor = new Processor({
      database,
      workflow: definition,
      execution,
      instructions,
    });
    await processor.prepare();
    return { processor, runId };
  }

  beforeEach(async () => {
    database = await createTestDatabase();
    runCounter = 0;
    workflow = await createTestWorkflow(database, {
      key: 'processor-api',
      nodes: [
        {
          key: 'head',
          type: 'echo',
          config: { value: 'head' },
          downstreamKey: 'gate',
        },
        {
          key: 'gate',
          type: 'condition',
          config: {},
          upstreamKey: 'head',
          downstreamKey: 'after',
        },
        {
          key: 'b1',
          type: 'echo',
          config: { value: 'b1' },
          upstreamKey: 'gate',
          branchKey: 'yes',
          downstreamKey: 'b2',
        },
        { key: 'b2', type: 'echo', config: { value: 'b2' }, upstreamKey: 'b1' },
        {
          key: 'other',
          type: 'echo',
          config: { value: 'other' },
          upstreamKey: 'gate',
          branchKey: 'no',
        },
        {
          key: 'after',
          type: 'echo',
          config: { value: 'after' },
          upstreamKey: 'gate',
        },
      ],
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('maps every nodeRun status to an execution status', () => {
    expect(Processor.StatusMap).toMatchObject({
      [NODE_RUN_STATUS.PENDING]: EXECUTION_STATUS.STARTED,
      [NODE_RUN_STATUS.RESOLVED]: EXECUTION_STATUS.RESOLVED,
      [NODE_RUN_STATUS.FAILED]: EXECUTION_STATUS.FAILED,
      [NODE_RUN_STATUS.ERROR]: EXECUTION_STATUS.ERROR,
      [NODE_RUN_STATUS.ABORTED]: EXECUTION_STATUS.ABORTED,
    });
  });

  it('records finishedAt for every terminal node status and keeps pending null', async () => {
    const { processor } = await createProcessor();
    const node = processor.workflow.nodes[0];
    for (const status of [
      NODE_RUN_STATUS.RESOLVED,
      NODE_RUN_STATUS.FAILED,
      NODE_RUN_STATUS.ERROR,
      NODE_RUN_STATUS.ABORTED,
    ]) {
      const nodeRun = await processor.saveNodeRun({
        nodeId: node.id,
        nodeKey: node.key,
        status,
      });
      expect(nodeRun.finishedAt).toBeTruthy();
    }
    const pending = await processor.saveNodeRun({
      nodeId: node.id,
      nodeKey: node.key,
      status: NODE_RUN_STATUS.PENDING,
    });
    expect(pending.finishedAt).toBeNull();
  });

  it('exposes a query adapter bound to the configured connection', async () => {
    const { processor, runId } = await createProcessor();
    await expect(
      processor.query
        .selectFrom(WORKFLOW_COLLECTIONS.runs)
        .where('id', '=', runId)
        .value('eventKey'),
    ).resolves.toBe('processor-1');
    expect(processor.database).toBe(database);
    expect(processor.execution.id).toBe(runId);
    expect(processor.workflow.key).toBe('processor-api');
    expect(processor.nodes).toHaveLength(6);
    expect(processor.nodesMap.get('gate')?.downstream?.key).toBe('after');
  });

  it('aborts the execution and derives background handles from the same signal', async () => {
    const { processor } = await createProcessor();
    expect(processor.abortSignal.aborted).toBe(false);

    const live = processor.createBackgroundAbortHandle();
    expect(live.signal.aborted).toBe(false);
    expect(() => live.throwIfAborted()).not.toThrow();

    processor.abortExecution(EXECUTION_REASON.TIMEOUT);
    expect(processor.abortSignal.aborted).toBe(true);
    expect(processor.abortController.signal.aborted).toBe(true);
    expect(live.signal.aborted).toBe(true);
    expect(() => live.throwIfAborted()).toThrow(/timed out/);

    // A handle created after the fact starts out aborted.
    const late = processor.createBackgroundAbortHandle();
    expect(late.signal.aborted).toBe(true);
    live.dispose();
    late.dispose();
  });

  it('saves a nodeRun, remembers it, and finds it again while it is pending', async () => {
    const { processor, runId } = await createProcessor();
    const gate = nodeOf('gate');

    const pending = await processor.saveNodeRun({
      nodeId: gate.id,
      nodeKey: gate.key,
      status: NODE_RUN_STATUS.PENDING,
      result: { waiting: true },
      meta: { note: 'meta' },
      log: 'saved',
    });
    expect(processor.lastSavedNodeRun).toEqual(pending);
    await expect(
      processor.findPendingNodeRun(pending.id),
    ).resolves.toMatchObject({
      id: pending.id,
      result: { waiting: true },
      meta: { note: 'meta' },
      log: 'saved',
    });

    // Passing the existing nodeRun in overwrites it instead of appending a row.
    const resolved = await processor.saveNodeRun(
      {
        nodeId: gate.id,
        nodeKey: gate.key,
        status: NODE_RUN_STATUS.RESOLVED,
        result: 'done',
      },
      pending,
    );
    expect(resolved.id).toBe(pending.id);
    await expect(processor.findPendingNodeRun(pending.id)).resolves.toBeNull();
    await expect(listNodeRuns(database, runId)).resolves.toEqual([
      { nodeKey: 'gate', status: NODE_RUN_STATUS.RESOLVED, result: 'done' },
    ]);
  });

  it('navigates the branch topology from any node', async () => {
    const { processor } = await createProcessor();
    const gate = processor.nodesMap.get('gate');
    const b1 = processor.nodesMap.get('b1');
    const b2 = processor.nodesMap.get('b2');
    const after = processor.nodesMap.get('after');
    expect(gate && b1 && b2 && after).toBeTruthy();

    expect(processor.getBranches(gate!).map((node) => node.key)).toEqual([
      'other',
      'b1',
    ]);
    expect(processor.findBranchStartNode(b2!)?.key).toBe('b1');
    expect(processor.findBranchStartNode(b2!, gate!)?.key).toBe('b1');
    expect(processor.findBranchParentNode(b2!)?.key).toBe('gate');
    expect(processor.findBranchParentNode(after!)).toBeNull();
    expect(processor.findBranchEndNode(b1!).key).toBe('b2');
    expect(processor.findBranchEndNode(after!).key).toBe('after');

    const gateNodeRun = await processor.saveNodeRun({
      nodeId: gate!.id,
      nodeKey: 'gate',
      status: NODE_RUN_STATUS.RESOLVED,
      result: true,
    });
    const b1NodeRun = await processor.saveNodeRun({
      nodeId: b1!.id,
      nodeKey: 'b1',
      status: NODE_RUN_STATUS.RESOLVED,
      result: 'b1',
    });
    const b2NodeRun = await processor.saveNodeRun({
      nodeId: b2!.id,
      nodeKey: 'b2',
      status: NODE_RUN_STATUS.RESOLVED,
      result: 'b2',
    });

    expect(processor.findBranchParentNodeRun(b2NodeRun, gate!)).toEqual(
      gateNodeRun,
    );
    // The last nodeRun of the branch is the deepest one that actually ran.
    expect(processor.findBranchLastNodeRun(b1!)).toEqual(b2NodeRun);
    expect(b1NodeRun.nodeKey).toBe('b1');
  });

  it('builds a scope and resolves variables against it', async () => {
    const { processor } = await createProcessor();
    const b1 = processor.nodesMap.get('b1');

    const scope = processor.getScope(b1);
    expect(scope.$context).toEqual({ amount: 7 });
    expect(scope.$input).toEqual({});
    expect(scope.$node).toBe(b1);
    expect(scope.ctx).toBeDefined();

    expect(processor.getParsedValue('{{$context.amount}}', b1)).toBe(7);
    expect(processor.getParsedValue('amount is {{$context.amount}}', b1)).toBe(
      'amount is 7',
    );
    expect(
      processor.getParsedValue({ nested: '{{$extra.value}}' }, b1, {
        additionalScope: { $extra: { value: 'injected' } },
      }),
    ).toEqual({ nested: 'injected' });
    expect(processor.getScope(b1, true).$node).toBe(b1);
  });

  it('runs a single node and ends the flow when nothing follows it', async () => {
    const { processor, runId } = await createProcessor();
    const after = processor.nodesMap.get('after');

    // `run()` hands control to `end()`, which exits on the main flow and
    // therefore returns null; the nodeRun it saved is on `lastSavedNodeRun`.
    await expect(processor.run(after!, { result: null })).resolves.toBeNull();

    expect(processor.lastSavedNodeRun).toMatchObject({
      nodeKey: 'after',
      status: NODE_RUN_STATUS.RESOLVED,
      result: 'after',
    });
    await expect(readRun(database, runId)).resolves.toMatchObject({
      status: EXECUTION_STATUS.RESOLVED,
      output: 'after',
    });
  });

  it('ends a main-flow node by exiting, and a branch node by recalling its parent', async () => {
    const mainFlow = await createProcessor();
    const after = mainFlow.processor.nodesMap.get('after');
    const nodeRun = await mainFlow.processor.saveNodeRun({
      nodeId: after!.id,
      nodeKey: 'after',
      status: NODE_RUN_STATUS.RESOLVED,
      result: 'ended',
    });
    await mainFlow.processor.end(after!, nodeRun);
    await expect(readRun(database, mainFlow.runId)).resolves.toMatchObject({
      status: EXECUTION_STATUS.RESOLVED,
      output: 'ended',
    });

    const branch = await createProcessor();
    const gate = branch.processor.nodesMap.get('gate');
    const b2 = branch.processor.nodesMap.get('b2');
    await branch.processor.saveNodeRun({
      nodeId: gate!.id,
      nodeKey: 'gate',
      status: NODE_RUN_STATUS.PENDING,
      result: true,
    });
    const branchNodeRun = await branch.processor.saveNodeRun({
      nodeId: b2!.id,
      nodeKey: 'b2',
      status: NODE_RUN_STATUS.RESOLVED,
      result: 'b2',
    });
    await branch.processor.end(b2!, branchNodeRun);
    // Control went back to `gate`, which resumed and continued to `after`.
    await expect(listNodeRuns(database, branch.runId)).resolves.toEqual([
      { nodeKey: 'gate', status: NODE_RUN_STATUS.RESOLVED, result: true },
      { nodeKey: 'b2', status: NODE_RUN_STATUS.RESOLVED, result: 'b2' },
      { nodeKey: 'after', status: NODE_RUN_STATUS.RESOLVED, result: 'after' },
    ]);
  });

  it('exits with an explicit status and output, and ignores a non-numeric status', async () => {
    const { processor, runId } = await createProcessor();

    await expect(processor.exit(true)).resolves.toBeNull();
    await expect(readRun(database, runId)).resolves.toMatchObject({
      status: EXECUTION_STATUS.STARTED,
    });

    await processor.exit(NODE_RUN_STATUS.FAILED, { message: 'nope' });
    expect(processor.execution.status).toBe(EXECUTION_STATUS.FAILED);
    await expect(readRun(database, runId)).resolves.toMatchObject({
      status: EXECUTION_STATUS.FAILED,
      output: { message: 'nope' },
    });
  });

  it('starts, resumes and re-runs an execution through its own entry points', async () => {
    const started = await createProcessor();
    await started.processor.start();
    await expect(listNodeRuns(database, started.runId)).resolves.toEqual([
      { nodeKey: 'head', status: NODE_RUN_STATUS.RESOLVED, result: 'head' },
      { nodeKey: 'gate', status: NODE_RUN_STATUS.RESOLVED, result: true },
      { nodeKey: 'b1', status: NODE_RUN_STATUS.RESOLVED, result: 'b1' },
      { nodeKey: 'b2', status: NODE_RUN_STATUS.RESOLVED, result: 'b2' },
      { nodeKey: 'after', status: NODE_RUN_STATUS.RESOLVED, result: 'after' },
    ]);

    const resumed = await createProcessor();
    const gate = resumed.processor.nodesMap.get('gate');
    const gateNodeRun = await resumed.processor.saveNodeRun({
      nodeId: gate!.id,
      nodeKey: 'gate',
      status: NODE_RUN_STATUS.RESOLVED,
      result: true,
    });
    await resumed.processor.resume(gateNodeRun);
    await expect(listNodeRuns(database, resumed.runId)).resolves.toEqual([
      { nodeKey: 'gate', status: NODE_RUN_STATUS.RESOLVED, result: true },
      { nodeKey: 'after', status: NODE_RUN_STATUS.RESOLVED, result: 'after' },
    ]);

    const reran = await createProcessor();
    await reran.processor.saveNodeRun({
      nodeId: nodeOf('head').id,
      nodeKey: 'head',
      status: NODE_RUN_STATUS.RESOLVED,
      result: 'stale',
    });
    await reran.processor.rerun({ nodeKey: 'head', overwrite: true });
    const nodeRuns = await listNodeRuns(database, reran.runId);
    expect(nodeRuns[0]).toEqual({
      nodeKey: 'head',
      status: NODE_RUN_STATUS.RESOLVED,
      result: 'head',
    });
    expect(nodeRuns.map((entry) => entry.nodeKey)).toEqual([
      'head',
      'gate',
      'b1',
      'b2',
      'after',
    ]);
  });

  it('resolves a workflow that has no nodes at all', async () => {
    const empty = await createTestWorkflow(database, {
      key: 'empty',
      nodes: [],
    });
    const { processor, runId } = await createProcessor(empty);

    await processor.start();

    await expect(readRun(database, runId)).resolves.toMatchObject({
      status: EXECUTION_STATUS.RESOLVED,
    });
    await expect(listNodeRuns(database, runId)).resolves.toEqual([]);
  });

  it('refuses a workflow that does not have exactly one head node', async () => {
    const twoHeads = await createTestWorkflow(database, {
      key: 'two-heads',
      nodes: [
        { key: 'headA', type: 'echo', config: { value: 'a' } },
        { key: 'headB', type: 'echo', config: { value: 'b' } },
      ],
    });
    const { processor, runId } = await createProcessor(twoHeads);

    await processor.start();

    const run = await readRun(database, runId);
    expect(run.status).toBe(EXECUTION_STATUS.ERROR);
    expect(run.output).toMatchObject({
      message: expect.stringContaining('found 2'),
    });
    await expect(listNodeRuns(database, runId)).resolves.toEqual([]);
  });

  it('refuses to re-run an unknown node or an execution that is not started', async () => {
    const { processor } = await createProcessor();
    await expect(processor.rerun({ nodeKey: 'missing' })).rejects.toThrow(
      /was not found/,
    );

    await processor.exit(NODE_RUN_STATUS.RESOLVED, null);
    await expect(processor.rerun()).rejects.toThrow(/is not started/);
  });
});
