import type { DatabaseManager } from '@nocobase/app-database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
} from '../server/engine/constants.js';
import Dispatcher from '../server/engine/dispatcher.js';
import Processor from '../server/engine/processor.js';
import type { WorkflowInstructionClass } from '../server/instructions/base.js';
import {
  ConditionInstruction,
  validateConditionConfig,
} from '../server/instructions/condition/instruction.js';
import {
  evaluateJsonLogic,
  type JsonLogicExpression,
} from '../server/instructions/condition/json-logic/index.js';
import {
  coreInstructions,
  RunInstruction,
} from '../server/instructions/index.js';
import { defineTestInstruction } from './fixtures/instructions.js';
import {
  createTestDatabase,
  createTestWorkflow,
  findRun,
  listNodeRuns,
  type TestNodeInput,
} from './helpers.js';

const echo: WorkflowInstructionClass = defineTestInstruction(
  'echo',
  async (instruction) => ({
    status: NODE_RUN_STATUS.RESOLVED,
    result: instruction.node.config.value ?? instruction.node.key,
  }),
);

const failing: WorkflowInstructionClass = defineTestInstruction(
  'failing',
  async () => ({
    status: NODE_RUN_STATUS.FAILED,
    result: 'rejected',
  }),
);

const instructions = new Map<string, WorkflowInstructionClass>([
  ...coreInstructions,
  ['echo', echo],
  ['failing', failing],
]);

function createDispatcher(database: DatabaseManager): Dispatcher {
  const dispatcher = new Dispatcher({
    database,
    instructions,
  });
  return dispatcher;
}

/** `{{$context.amount}} > limit` */
function amountGreaterThan(limit: number): Record<string, unknown> {
  return { '>': [{ var: 'context.amount' }, limit] };
}

describe('condition instruction', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('enters the yes branch and returns to the common successor', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'single-branch',
      nodes: [
        {
          key: 'check',
          type: 'condition',
          config: { expression: amountGreaterThan(100) },
          downstreamKey: 'after',
        },
        {
          key: 'onYes',
          type: 'echo',
          config: { value: 'yes-branch' },
          upstreamKey: 'check',
          branchKey: 'yes',
        },
        {
          key: 'after',
          type: 'echo',
          config: { value: 'after' },
          upstreamKey: 'check',
        },
      ],
    });

    const dispatcher = createDispatcher(database);
    await dispatcher.trigger(
      workflow,
      { amount: 500 },
      { eventKey: 'yes', manually: true },
    );

    const run = await findRun(database, 'yes');
    expect(run.status).toBe(EXECUTION_STATUS.RESOLVED);
    expect(await listNodeRuns(database, run.id as number)).toEqual([
      { nodeKey: 'check', status: NODE_RUN_STATUS.RESOLVED, result: true },
      {
        nodeKey: 'onYes',
        status: NODE_RUN_STATUS.RESOLVED,
        result: 'yes-branch',
      },
      { nodeKey: 'after', status: NODE_RUN_STATUS.RESOLVED, result: 'after' },
    ]);
  });

  it('falls through to the downstream node when the matching branch is not declared', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'missing-branch',
      nodes: [
        {
          key: 'check',
          type: 'condition',
          config: { expression: amountGreaterThan(100) },
          downstreamKey: 'after',
        },
        { key: 'onYes', type: 'echo', upstreamKey: 'check', branchKey: 'yes' },
        {
          key: 'after',
          type: 'echo',
          config: { value: 'after' },
          upstreamKey: 'check',
        },
      ],
    });

    const dispatcher = createDispatcher(database);
    await dispatcher.trigger(
      workflow,
      { amount: 1 },
      { eventKey: 'no', manually: true },
    );

    const run = await findRun(database, 'no');
    expect(run.status).toBe(EXECUTION_STATUS.RESOLVED);
    expect(await listNodeRuns(database, run.id as number)).toEqual([
      { nodeKey: 'check', status: NODE_RUN_STATUS.RESOLVED, result: false },
      { nodeKey: 'after', status: NODE_RUN_STATUS.RESOLVED, result: 'after' },
    ]);
  });

  it('picks the no branch when it is declared', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'both-branches',
      nodes: [
        {
          key: 'check',
          type: 'condition',
          config: { expression: amountGreaterThan(100) },
          downstreamKey: 'after',
        },
        {
          key: 'onYes',
          type: 'echo',
          config: { value: 'high' },
          upstreamKey: 'check',
          branchKey: 'yes',
        },
        {
          key: 'onNo',
          type: 'echo',
          config: { value: 'low' },
          upstreamKey: 'check',
          branchKey: 'no',
        },
        {
          key: 'after',
          type: 'echo',
          config: { value: 'after' },
          upstreamKey: 'check',
        },
      ],
    });

    const dispatcher = createDispatcher(database);
    await dispatcher.trigger(
      workflow,
      { amount: 1 },
      { eventKey: 'low', manually: true },
    );

    const run = await findRun(database, 'low');
    expect(
      (await listNodeRuns(database, run.id as number)).map(
        (nodeRun) => nodeRun.nodeKey,
      ),
    ).toEqual(['check', 'onNo', 'after']);
  });

  it('recalls through several levels of nested branches', async () => {
    // check (yes) -> inner (yes) -> deep ; inner.next = afterInner ; check.next = afterCheck
    const nodes: TestNodeInput[] = [
      {
        key: 'check',
        type: 'condition',
        config: { expression: amountGreaterThan(100) },
        downstreamKey: 'afterCheck',
      },
      {
        key: 'inner',
        type: 'condition',
        config: { expression: amountGreaterThan(1000) },
        upstreamKey: 'check',
        branchKey: 'yes',
        downstreamKey: 'afterInner',
      },
      {
        key: 'deep',
        type: 'echo',
        config: { value: 'deep' },
        upstreamKey: 'inner',
        branchKey: 'yes',
      },
      {
        key: 'afterInner',
        type: 'echo',
        config: { value: 'after-inner' },
        upstreamKey: 'inner',
      },
      {
        key: 'afterCheck',
        type: 'echo',
        config: { value: 'after-check' },
        upstreamKey: 'check',
      },
    ];
    const workflow = await createTestWorkflow(database, {
      key: 'nested',
      nodes,
    });

    const dispatcher = createDispatcher(database);
    await dispatcher.trigger(
      workflow,
      { amount: 5000 },
      { eventKey: 'nested', manually: true },
    );

    const run = await findRun(database, 'nested');
    expect(run.status).toBe(EXECUTION_STATUS.RESOLVED);
    expect(
      (await listNodeRuns(database, run.id as number)).map(
        (nodeRun) => nodeRun.nodeKey,
      ),
    ).toEqual(['check', 'inner', 'deep', 'afterInner', 'afterCheck']);
  });

  it('bubbles a rejected branch nodeRun up instead of continuing downstream', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'rejected-branch',
      nodes: [
        { key: 'check', type: 'condition', downstreamKey: 'after' },
        {
          key: 'onYes',
          type: 'failing',
          upstreamKey: 'check',
          branchKey: 'yes',
        },
        { key: 'after', type: 'echo', upstreamKey: 'check' },
      ],
    });

    const dispatcher = createDispatcher(database);
    await dispatcher.trigger(
      workflow,
      { amount: 1 },
      { eventKey: 'rejected', manually: true },
    );

    const run = await findRun(database, 'rejected');
    expect(run.status).toBe(EXECUTION_STATUS.FAILED);
    expect(
      (await listNodeRuns(database, run.id as number)).map(
        (nodeRun) => nodeRun.nodeKey,
      ),
    ).toEqual(['check', 'onYes']);
  });

  it('reports an invalid config as an ERROR nodeRun', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'bad-config',
      nodes: [
        {
          key: 'check',
          type: 'condition',
          config: { expression: { nope: [1, 2] } },
        },
      ],
    });

    const dispatcher = createDispatcher(database);
    await dispatcher.trigger(
      workflow,
      { amount: 1 },
      { eventKey: 'bad', manually: true },
    );

    const run = await findRun(database, 'bad');
    expect(run.status).toBe(EXECUTION_STATUS.ERROR);
    const nodeRuns = await listNodeRuns(database, run.id as number);
    expect(nodeRuns[0].status).toBe(NODE_RUN_STATUS.ERROR);
  });

  it('uses prior node results without exposing Processor scope objects', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'node-result-binding',
      nodes: [
        {
          key: 'seed',
          type: 'echo',
          config: { value: 42 },
          downstreamKey: 'check',
        },
        {
          key: 'check',
          type: 'condition',
          config: { expression: { '===': [{ var: 'nodeResults.seed' }, 42] } },
          upstreamKey: 'seed',
        },
        {
          key: 'matched',
          type: 'echo',
          upstreamKey: 'check',
          branchKey: 'yes',
        },
      ],
    });
    const dispatcher = createDispatcher(database);
    await dispatcher.trigger(
      workflow,
      {},
      { eventKey: 'node-result', manually: true },
    );
    const run = await findRun(database, 'node-result');
    expect(
      (await listNodeRuns(database, run.id as number)).map(
        (nodeRun) => nodeRun.nodeKey,
      ),
    ).toEqual(['seed', 'check', 'matched']);
  });

  it('records a non-boolean expression result as ERROR', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'non-boolean',
      nodes: [
        {
          key: 'check',
          type: 'condition',
          config: { expression: { var: 'context.amount' } },
        },
      ],
    });
    const dispatcher = createDispatcher(database);
    await dispatcher.trigger(
      workflow,
      { amount: 1 },
      { eventKey: 'non-boolean', manually: true },
    );
    const run = await findRun(database, 'non-boolean');
    expect(run.status).toBe(EXECUTION_STATUS.ERROR);
    expect((await listNodeRuns(database, run.id as number))[0]).toMatchObject({
      status: NODE_RUN_STATUS.ERROR,
    });
  });
});

describe('condition JSON Logic evaluation', () => {
  const data = {
    context: { amount: 500 },
    input: { status: 'approved' },
    nodeResults: { lookup: ['a', 'b'] },
  };

  it('evaluates strict comparisons, variables, text and membership operators', () => {
    expect(evaluateJsonLogic({ '===': [1, 1] }, data)).toBe(true);
    expect(evaluateJsonLogic({ '===': ['1', 1] }, data)).toBe(false);
    expect(
      evaluateJsonLogic({ '>': [{ var: 'context.amount' }, 100] }, data),
    ).toBe(true);
    expect(
      evaluateJsonLogic(
        { in: [{ var: 'input.status' }, ['approved', 'pending']] },
        data,
      ),
    ).toBe(true);
    expect(evaluateJsonLogic({ in: ['prove', 'approved'] }, data)).toBe(true);
    expect(evaluateJsonLogic({ startsWith: ['workflow', 'work'] }, data)).toBe(
      true,
    );
    expect(evaluateJsonLogic({ endsWith: ['workflow', 'flow'] }, data)).toBe(
      true,
    );
  });

  it('uses explicit truthiness and short-circuits logical operators', () => {
    expect(evaluateJsonLogic({ '!': [[]] }, data)).toBe(true);
    expect(evaluateJsonLogic({ '!': [''] }, data)).toBe(true);
    expect(evaluateJsonLogic({ or: [true, { in: [1, 2] }] }, data)).toBe(true);
    expect(evaluateJsonLogic({ and: [false, { in: [1, 2] }] }, data)).toBe(
      false,
    );
  });

  it('returns null for a missing variable and supports a default', () => {
    expect(evaluateJsonLogic({ var: 'context.missing' }, data)).toBeNull();
    expect(evaluateJsonLogic({ var: ['context.missing', false] }, data)).toBe(
      false,
    );
  });

  it('does not coerce different types for ordering', () => {
    expect(evaluateJsonLogic({ '>': ['10', 2] }, data)).toBe(false);
    expect(evaluateJsonLogic({ '<': ['a', 'b'] }, data)).toBe(true);
  });
});

describe('validateConditionConfig', () => {
  it('accepts the supported fields', () => {
    expect(validateConditionConfig({})).toBeNull();
    expect(
      validateConditionConfig({
        expression: { '>': [{ var: 'context.amount' }, 100] },
      }),
    ).toBeNull();
  });

  it('rejects legacy fields, unknown operators, bad arity and unsafe variables', () => {
    expect(validateConditionConfig({ engine: 'math.js' })).toMatchObject({
      engine: expect.any(String),
    });
    expect(validateConditionConfig({ rejectOnFalse: true })).toMatchObject({
      rejectOnFalse: expect.any(String),
    });
    expect(validateConditionConfig({ calculation: {} })).toMatchObject({
      calculation: expect.any(String),
    });
    expect(
      validateConditionConfig({ expression: { sql: [1, 2] } }),
    ).toMatchObject({ expression: expect.any(String) });
    expect(
      validateConditionConfig({ expression: { '>': [1] } }),
    ).not.toBeNull();
    expect(
      validateConditionConfig({ expression: { var: 'context.__proto__.x' } }),
    ).not.toBeNull();
    expect(
      validateConditionConfig({ expression: { var: 'system.secret' } }),
    ).not.toBeNull();
  });

  it('enforces expression resource limits', () => {
    expect(
      validateConditionConfig({
        expression: { and: Array.from({ length: 65 }, () => true) },
      }),
    ).not.toBeNull();
    let expression: JsonLogicExpression = true;
    for (let index = 0; index < 33; index += 1)
      expression = { '!': [expression] };
    expect(validateConditionConfig({ expression })).not.toBeNull();
  });
});

describe('instruction registry', () => {
  it('exposes condition and run as core instructions', () => {
    expect(coreInstructions.get('condition')).toBe(ConditionInstruction);
    expect(ConditionInstruction.branching).toBe(true);
    expect(coreInstructions.get('run')).toBe(RunInstruction);
  });

  it('returns the same object from the define helpers', () => {});
});

describe('programmatic trigger', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('accepts events raised by application business logic', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'manual-only',
      nodes: [{ key: 'only', type: 'echo', config: { value: 1 } }],
    });
    const dispatcher = createDispatcher(database);

    await dispatcher.trigger(
      workflow,
      { amount: 1 },
      { eventKey: 'custom-event' },
    );

    expect((await findRun(database, 'custom-event')).status).toBe(
      EXECUTION_STATUS.RESOLVED,
    );
  });
});

describe('Processor.getBranches', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('orders branches by branchKey as plain strings, not numerically (D4)', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'branch-order',
      nodes: [
        { key: 'check', type: 'condition' },
        { key: 'b10', type: 'echo', upstreamKey: 'check', branchKey: 'b10' },
        { key: 'b9', type: 'echo', upstreamKey: 'check', branchKey: 'b9' },
        { key: 'b2', type: 'echo', upstreamKey: 'check', branchKey: 'b2' },
      ],
    });
    const processor = new Processor({
      database,
      workflow,
      execution: {
        id: 1,
        workflowId: workflow.id,
        workflowKey: workflow.key,
        eventKey: 'ordering',
        context: {},
        input: {},
        status: EXECUTION_STATUS.STARTED,
        dispatched: true,
        parentRunId: null,
        stack: [],
        output: null,
        startedAt: null,
        expiresAt: null,
        createdAt: new Date().toISOString(),
        manually: true,
        reason: null,
      },
      instructions,
    });
    await processor.prepare();

    const check = processor.nodesMap.get('check');
    expect(check).toBeDefined();
    // Numeric collation would give b2, b9, b10.
    expect(processor.getBranches(check!).map((node) => node.branchKey)).toEqual(
      ['b10', 'b2', 'b9'],
    );
  });
});
