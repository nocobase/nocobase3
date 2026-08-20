import type { DatabaseManager } from '@nocobase/database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  conditionInstruction,
  coreInstructions,
  coreTriggers,
  defineInstruction,
  defineTrigger,
  Dispatcher,
  evaluateConditionCalculation,
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
  customTrigger,
  Processor,
  runInstruction,
  validateConditionConfig,
  type WorkflowInstruction,
} from '../src/index.js';
import { createTestDatabase, createTestWorkflow, findRun, listNodeRuns, type TestNodeInput } from './helpers.js';

const echo: WorkflowInstruction = defineInstruction({
  async run(node) {
    return { status: NODE_RUN_STATUS.RESOLVED, result: node.config.value ?? node.key };
  },
});

const failing: WorkflowInstruction = defineInstruction({
  async run() {
    return { status: NODE_RUN_STATUS.FAILED, result: 'rejected' };
  },
});

const instructions = new Map<string, WorkflowInstruction>([
  ...coreInstructions,
  ['echo', echo],
  ['failing', failing],
]);

function createDispatcher(database: DatabaseManager): Dispatcher {
  const dispatcher = new Dispatcher({
    database,
    instructions,
    triggers: new Map(coreTriggers),
  });
  dispatcher.setReady(true);
  return dispatcher;
}

/** `{{$context.amount}} > limit` */
function amountGreaterThan(limit: number): Record<string, unknown> {
  return { calculator: 'gt', operands: ['{{$context.amount}}', limit] };
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
        { key: 'check', type: 'condition', config: { calculation: amountGreaterThan(100) }, downstreamKey: 'after' },
        { key: 'onYes', type: 'echo', config: { value: 'yes-branch' }, upstreamKey: 'check', branchKey: 'yes' },
        { key: 'after', type: 'echo', config: { value: 'after' }, upstreamKey: 'check' },
      ],
    });

    const dispatcher = createDispatcher(database);
    await dispatcher.trigger(workflow, { amount: 500 }, { eventKey: 'yes', manually: true });

    const run = await findRun(database, 'yes');
    expect(run.status).toBe(EXECUTION_STATUS.RESOLVED);
    expect(await listNodeRuns(database, run.id as number)).toEqual([
      { nodeKey: 'check', status: NODE_RUN_STATUS.RESOLVED, result: true },
      { nodeKey: 'onYes', status: NODE_RUN_STATUS.RESOLVED, result: 'yes-branch' },
      // The recall from the branch appends a second nodeRun for the branch parent.
      { nodeKey: 'check', status: NODE_RUN_STATUS.RESOLVED, result: true },
      { nodeKey: 'after', status: NODE_RUN_STATUS.RESOLVED, result: 'after' },
    ]);
  });

  it('falls through to the downstream node when the matching branch is not declared', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'missing-branch',
      nodes: [
        { key: 'check', type: 'condition', config: { calculation: amountGreaterThan(100) }, downstreamKey: 'after' },
        { key: 'onYes', type: 'echo', upstreamKey: 'check', branchKey: 'yes' },
        { key: 'after', type: 'echo', config: { value: 'after' }, upstreamKey: 'check' },
      ],
    });

    const dispatcher = createDispatcher(database);
    await dispatcher.trigger(workflow, { amount: 1 }, { eventKey: 'no', manually: true });

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
        { key: 'check', type: 'condition', config: { calculation: amountGreaterThan(100) }, downstreamKey: 'after' },
        { key: 'onYes', type: 'echo', config: { value: 'high' }, upstreamKey: 'check', branchKey: 'yes' },
        { key: 'onNo', type: 'echo', config: { value: 'low' }, upstreamKey: 'check', branchKey: 'no' },
        { key: 'after', type: 'echo', config: { value: 'after' }, upstreamKey: 'check' },
      ],
    });

    const dispatcher = createDispatcher(database);
    await dispatcher.trigger(workflow, { amount: 1 }, { eventKey: 'low', manually: true });

    const run = await findRun(database, 'low');
    expect((await listNodeRuns(database, run.id as number)).map((nodeRun) => nodeRun.nodeKey))
      .toEqual(['check', 'onNo', 'check', 'after']);
  });

  it('recalls through several levels of nested branches', async () => {
    // check (yes) -> inner (yes) -> deep ; inner.next = afterInner ; check.next = afterCheck
    const nodes: TestNodeInput[] = [
      { key: 'check', type: 'condition', config: { calculation: amountGreaterThan(100) }, downstreamKey: 'afterCheck' },
      {
        key: 'inner',
        type: 'condition',
        config: { calculation: amountGreaterThan(1000) },
        upstreamKey: 'check',
        branchKey: 'yes',
        downstreamKey: 'afterInner',
      },
      { key: 'deep', type: 'echo', config: { value: 'deep' }, upstreamKey: 'inner', branchKey: 'yes' },
      { key: 'afterInner', type: 'echo', config: { value: 'after-inner' }, upstreamKey: 'inner' },
      { key: 'afterCheck', type: 'echo', config: { value: 'after-check' }, upstreamKey: 'check' },
    ];
    const workflow = await createTestWorkflow(database, { key: 'nested', nodes });

    const dispatcher = createDispatcher(database);
    await dispatcher.trigger(workflow, { amount: 5000 }, { eventKey: 'nested', manually: true });

    const run = await findRun(database, 'nested');
    expect(run.status).toBe(EXECUTION_STATUS.RESOLVED);
    expect((await listNodeRuns(database, run.id as number)).map((nodeRun) => nodeRun.nodeKey)).toEqual([
      'check',
      'inner',
      'deep',
      'inner',
      'afterInner',
      'check',
      'afterCheck',
    ]);
  });

  it('bubbles a rejected branch nodeRun up instead of continuing downstream', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'rejected-branch',
      nodes: [
        { key: 'check', type: 'condition', downstreamKey: 'after' },
        { key: 'onYes', type: 'failing', upstreamKey: 'check', branchKey: 'yes' },
        { key: 'after', type: 'echo', upstreamKey: 'check' },
      ],
    });

    const dispatcher = createDispatcher(database);
    await dispatcher.trigger(workflow, { amount: 1 }, { eventKey: 'rejected', manually: true });

    const run = await findRun(database, 'rejected');
    expect(run.status).toBe(EXECUTION_STATUS.FAILED);
    expect((await listNodeRuns(database, run.id as number)).map((nodeRun) => nodeRun.nodeKey))
      .toEqual(['check', 'onYes', 'check']);
  });

  it('reports an invalid config as an ERROR nodeRun', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'bad-config',
      nodes: [{ key: 'check', type: 'condition', config: { calculation: { calculator: 'nope', operands: [1, 2] } } }],
    });

    const dispatcher = createDispatcher(database);
    await dispatcher.trigger(workflow, { amount: 1 }, { eventKey: 'bad', manually: true });

    const run = await findRun(database, 'bad');
    expect(run.status).toBe(EXECUTION_STATUS.ERROR);
    const nodeRuns = await listNodeRuns(database, run.id as number);
    expect(nodeRuns[0].status).toBe(NODE_RUN_STATUS.ERROR);
  });
});

describe('condition calculation', () => {
  it('treats a missing or incomplete calculation as true', () => {
    expect(evaluateConditionCalculation(undefined)).toBe(true);
    expect(evaluateConditionCalculation(null)).toBe(true);
    expect(evaluateConditionCalculation({})).toBe(true);
    expect(evaluateConditionCalculation({ calculator: 'gt', operands: [] })).toBe(true);
  });

  it('evaluates comparators and their symbol aliases the same way', () => {
    expect(evaluateConditionCalculation({ calculator: 'gt', operands: [2, 1] })).toBe(true);
    expect(evaluateConditionCalculation({ calculator: '>', operands: [2, 1] })).toBe(true);
    expect(evaluateConditionCalculation({ calculator: 'equal', operands: ['1', 1] })).toBe(true);
    expect(evaluateConditionCalculation({ calculator: '!=', operands: ['1', 2] })).toBe(true);
    expect(evaluateConditionCalculation({ calculator: 'lte', operands: [1, 1] })).toBe(true);
    expect(evaluateConditionCalculation({ calculator: 'startsWith', operands: ['abc', 'ab'] })).toBe(true);
    expect(evaluateConditionCalculation({ calculator: 'endsWith', operands: ['abc', 'bc'] })).toBe(true);
    expect(evaluateConditionCalculation({ calculator: 'includes', operands: [['a', 'b'], 'b'] })).toBe(true);
    expect(evaluateConditionCalculation({ calculator: 'notIncludes', operands: ['abc', 'z'] })).toBe(true);
  });

  it('compares dates by their epoch value and never against booleans', () => {
    const earlier = new Date('2026-01-01T00:00:00.000Z');
    const later = new Date('2026-02-01T00:00:00.000Z');
    expect(evaluateConditionCalculation({ calculator: 'lt', operands: [earlier, later] })).toBe(true);
    expect(evaluateConditionCalculation({ calculator: 'equal', operands: [earlier, '2026-01-01T00:00:00.000Z'] }))
      .toBe(true);
    expect(evaluateConditionCalculation({ calculator: 'gt', operands: [later, true] })).toBe(false);
    expect(evaluateConditionCalculation({ calculator: 'gt', operands: [later, null] })).toBe(false);
  });

  it('evaluates and / or groups recursively', () => {
    const group = {
      group: {
        type: 'and',
        calculations: [
          { calculator: 'gt', operands: [2, 1] },
          {
            group: {
              type: 'or',
              calculations: [
                { calculator: 'equal', operands: [1, 2] },
                { calculator: 'equal', operands: [3, 3] },
              ],
            },
          },
        ],
      },
    };
    expect(evaluateConditionCalculation(group)).toBe(true);
    expect(evaluateConditionCalculation({
      group: { type: 'and', calculations: [{ calculator: 'equal', operands: [1, 2] }] },
    })).toBe(false);
  });

  it('throws on an unregistered calculator', () => {
    expect(() => evaluateConditionCalculation({ calculator: 'sql', operands: [1, 2] }))
      .toThrow('No condition calculator registered for "sql"');
  });
});

describe('validateConditionConfig', () => {
  it('accepts the supported fields', () => {
    expect(validateConditionConfig({})).toBeNull();
    expect(validateConditionConfig({ calculation: { calculator: 'gt', operands: [1, 2] } })).toBeNull();
    expect(validateConditionConfig({
      calculation: { group: { type: 'or', calculations: [{ calculator: '==', operands: [1, 1] }] } },
    })).toBeNull();
  });

  it('rejects unknown fields, wrong types and unknown calculators', () => {
    expect(validateConditionConfig({ engine: 'math.js' })).toMatchObject({ engine: expect.any(String) });
    expect(validateConditionConfig({ rejectOnFalse: true })).toMatchObject({ rejectOnFalse: expect.any(String) });
    expect(validateConditionConfig({ calculation: { calculator: 'nope' } }))
      .toMatchObject({ calculation: expect.any(String) });
    expect(validateConditionConfig({ calculation: { group: { type: 'xor' } } }))
      .toMatchObject({ calculation: expect.any(String) });
    expect(validateConditionConfig({ calculation: { calculator: 'gt', operands: 'a' } }))
      .toMatchObject({ calculation: expect.any(String) });
  });
});

describe('instruction and trigger registries', () => {
  it('exposes condition and run as core instructions and custom as a core trigger', () => {
    expect(coreInstructions.get('condition')).toBe(conditionInstruction);
    expect(conditionInstruction.branching).toBe(true);
    expect(coreInstructions.get('run')).toBe(runInstruction);
    expect(coreTriggers.get('custom')).toBe(customTrigger);
  });

  it('returns the same object from the define helpers', () => {
    expect(defineInstruction(conditionInstruction)).toBe(conditionInstruction);
    expect(defineTrigger(customTrigger)).toBe(customTrigger);
  });
});

describe('custom trigger', () => {
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

    await dispatcher.trigger(workflow, { amount: 1 }, { eventKey: 'custom-event' });

    expect((await findRun(database, 'custom-event')).status).toBe(EXECUTION_STATUS.RESOLVED);
  });

  it('rejects any trigger config', () => {
    expect(customTrigger.validateConfig?.({})).toBeNull();
    expect(customTrigger.validateConfig?.({ mode: 1 })).toMatchObject({ config: expect.any(String) });
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
        context: null,
        input: {},
        status: EXECUTION_STATUS.STARTED,
        dispatched: true,
        parentExecutionId: null,
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
    expect(processor.getBranches(check!).map((node) => node.branchKey)).toEqual(['b10', 'b2', 'b9']);
  });
});
