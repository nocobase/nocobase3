import type { DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
} from '../server/engine/constants.js';
import Dispatcher from '../server/engine/dispatcher.js';
import type { WorkflowInstructionClass } from '../server/instructions/base.js';
import {
  coreInstructions,
  TerminateInstruction,
  validateTerminateConfig,
} from '../server/instructions/index.js';
import { defineTestInstruction } from './fixtures/instructions.js';
import {
  createTestDatabase,
  createTestWorkflow,
  findRun,
  listNodeRuns,
} from './helpers.js';

const echo: WorkflowInstructionClass = defineTestInstruction(
  'echo',
  async (instruction) => ({
    status: NODE_RUN_STATUS.RESOLVED,
    result: instruction.node.config.value ?? instruction.node.key,
  }),
);
const customTerminator: WorkflowInstructionClass = defineTestInstruction(
  'custom-terminator',
  async () => ({
    status: NODE_RUN_STATUS.RESOLVED,
    result: { source: 'custom' },
    terminated: true,
  }),
);

const instructions = new Map<string, WorkflowInstructionClass>([
  ...coreInstructions,
  ['custom-terminator', customTerminator],
  ['echo', echo],
]);

describe('terminate instruction', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('terminates a resolved workflow without running its downstream node', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'resolved-terminate',
      nodes: [
        { key: 'stop', type: 'terminate', downstreamKey: 'after' },
        {
          key: 'after',
          type: 'echo',
          config: { value: 'should-not-run' },
          upstreamKey: 'stop',
        },
      ],
    });

    await new Dispatcher({ database, instructions }).trigger(
      workflow,
      {},
      { eventKey: 'resolved-terminate', manually: true },
    );

    const run = await findRun(database, 'resolved-terminate');
    expect(run.status).toBe(EXECUTION_STATUS.RESOLVED);
    expect(await listNodeRuns(database, run.id as number)).toEqual([
      { nodeKey: 'stop', status: NODE_RUN_STATUS.RESOLVED, result: null },
    ]);
  });

  it('can finish a workflow as failed', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'failed-terminate',
      nodes: [
        {
          key: 'stop',
          type: 'terminate',
          config: { outcome: 'failure' },
        },
      ],
    });

    await new Dispatcher({ database, instructions }).trigger(
      workflow,
      {},
      { eventKey: 'failed-terminate', manually: true },
    );

    const run = await findRun(database, 'failed-terminate');
    expect(run.status).toBe(EXECUTION_STATUS.FAILED);
    expect(await listNodeRuns(database, run.id as number)).toEqual([
      { nodeKey: 'stop', status: NODE_RUN_STATUS.FAILED, result: null },
    ]);
  });

  it('honors terminated results from other instruction types', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'custom-terminator',
      nodes: [
        {
          key: 'customStop',
          type: 'custom-terminator',
          downstreamKey: 'after',
        },
        {
          key: 'after',
          type: 'echo',
          config: { value: 'should-not-run' },
          upstreamKey: 'customStop',
        },
      ],
    });

    await new Dispatcher({ database, instructions }).trigger(
      workflow,
      {},
      { eventKey: 'custom-terminator', manually: true },
    );

    const run = await findRun(database, 'custom-terminator');
    expect(run.status).toBe(EXECUTION_STATUS.RESOLVED);
    expect(await listNodeRuns(database, run.id as number)).toEqual([
      {
        nodeKey: 'customStop',
        status: NODE_RUN_STATUS.RESOLVED,
        result: { source: 'custom' },
      },
    ]);
  });

  it('terminates from a condition branch without recalling the condition or running the common successor', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'branch-terminate',
      nodes: [
        {
          key: 'check',
          type: 'condition',
          config: { expression: false },
          downstreamKey: 'after',
        },
        {
          key: 'stop',
          type: 'terminate',
          upstreamKey: 'check',
          branchKey: 'no',
        },
        {
          key: 'after',
          type: 'echo',
          config: { value: 'should-not-run' },
          upstreamKey: 'check',
        },
      ],
    });

    await new Dispatcher({ database, instructions }).trigger(
      workflow,
      {},
      { eventKey: 'branch-terminate', manually: true },
    );

    const run = await findRun(database, 'branch-terminate');
    expect(run.status).toBe(EXECUTION_STATUS.RESOLVED);
    expect(await listNodeRuns(database, run.id as number)).toEqual([
      { nodeKey: 'check', status: NODE_RUN_STATUS.PENDING, result: false },
      { nodeKey: 'stop', status: NODE_RUN_STATUS.RESOLVED, result: null },
    ]);
  });

  it('exposes a typed DSL expression and validates config', () => {
    expect(
      TerminateInstruction.create({ key: 'stop', config: {} }),
    ).toMatchObject({
      key: 'stop',
      type: 'terminate',
      config: {},
    });
    expect(validateTerminateConfig({})).toEqual([]);
    expect(validateTerminateConfig({ outcome: 'success' })).toEqual([]);
    expect(validateTerminateConfig({ outcome: 'failure' })).toEqual([]);
    expect(
      validateTerminateConfig({ outcome: 'unknown', extra: true }),
    ).toEqual([
      {
        path: 'config.extra',
        message: 'terminate config does not accept field "extra"',
      },
      {
        path: 'config.outcome',
        message: 'terminate config outcome must be "success" or "failure"',
      },
    ]);
  });
});
