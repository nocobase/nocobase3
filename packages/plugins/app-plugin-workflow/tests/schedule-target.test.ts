import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { describe, expect, it, vi } from 'vitest';

import { WorkflowInvocationError } from '../server/engine/invocation.js';
import { WorkflowScheduleTarget } from '../server/schedule-target.js';
import type { WorkflowServiceContract } from '../server/tokens.js';

const context = {
  scheduleId: 'schedule-1',
  occurrenceId: 'occurrence-2',
  scheduledFor: new Date('2026-09-02T00:00:00.000Z'),
  runNumber: 3,
};

describe('WorkflowScheduleTarget', () => {
  it('uses a stable occurrence-scoped event key and returns only a controlled receipt', async () => {
    const trigger = vi.fn(async () => ({
      status: 'accepted' as const,
      eventKey: 'schedule:schedule-1:occurrence-2',
    }));
    const target = createTarget(trigger);

    await expect(
      target.execute({ workflowKey: 'daily', input: { customer: 1 } }, context),
    ).resolves.toEqual({
      status: 'triggered',
      receipt: { eventKey: 'schedule:schedule-1:occurrence-2' },
    });
    expect(trigger).toHaveBeenCalledWith(
      'daily',
      { customer: 1 },
      { eventKey: 'schedule:schedule-1:occurrence-2' },
    );
  });

  it('does not trigger a second Workflow Run for the same occurrence', async () => {
    const database = createDatabaseManager({
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    try {
      await database
        .builder()
        .createCollection('workflowRuns', (collection) => {
          collection.increments('id');
          collection.string('eventKey').notNull().unique({ mode: 'index' });
        });
      const trigger = vi.fn(async (_key, _input, options) => {
        await database
          .query()
          .insertInto('workflow_runs')
          .values({ eventKey: options?.eventKey })
          .execute();
        return {
          status: 'accepted' as const,
          eventKey: options?.eventKey ?? '',
        };
      });
      const target = createTarget(trigger, database);
      const config = { workflowKey: 'daily' };
      await target.execute(config, context);
      await expect(target.execute(config, context)).resolves.toEqual({
        status: 'triggered',
        receipt: { eventKey: 'schedule:schedule-1:occurrence-2' },
      });
      expect(trigger).toHaveBeenCalledOnce();
      await expect(
        database.query().selectFrom('workflow_runs').selectAll().execute(),
      ).resolves.toHaveLength(1);
    } finally {
      await database.destroy();
    }
  });

  it.each([
    ['not-found', { status: 'failed', reason: 'target-not-found' }],
    ['disabled', { status: 'skipped', reason: 'target-disabled' }],
  ] as const)('maps a %s receipt', async (reason, expected) => {
    const target = createTarget(async () => ({ status: 'skipped', reason }));
    await expect(
      target.execute({ workflowKey: 'daily' }, context),
    ).resolves.toEqual(expected);
  });

  it.each([
    [new WorkflowInvocationError('INVALID_INPUT', 'invalid'), 'invalid-input'],
    [new WorkflowInvocationError('INPUT_TOO_LARGE', 'large'), 'invalid-input'],
    [
      new Error('Workflow Artifact daily/hash is missing'),
      'artifact-unavailable',
    ],
    [new Error('network'), 'trigger-failed'],
  ])('maps execution failure %s', async (error, reason) => {
    const target = createTarget(async () => {
      throw error;
    });
    await expect(
      target.execute({ workflowKey: 'daily' }, context),
    ).resolves.toEqual({
      status: 'failed',
      reason,
    });
  });

  it('validates workflow key and object input without leaking input', () => {
    const target = createTarget(async () => ({
      status: 'skipped',
      reason: 'not-found',
    }));
    expect(target.validate({ workflowKey: '' })).toEqual({
      valid: false,
      reason: 'invalid-config',
    });
    expect(target.validate({ workflowKey: 'daily', input: [] })).toEqual({
      valid: false,
      reason: 'invalid-input',
    });
    expect(target.validate({ workflowKey: 'daily', input: {} })).toEqual({
      valid: true,
    });
  });
});

function createTarget(
  trigger: WorkflowServiceContract['trigger'],
  database: DatabaseManager = emptyDatabase(),
): WorkflowScheduleTarget {
  return new WorkflowScheduleTarget(database, {
    registerInstruction: () => {},
    trigger,
  });
}

function emptyDatabase(): DatabaseManager {
  return {
    query: () => ({
      selectFrom: () => ({
        select: () => ({
          where: () => ({
            where: () => ({ executeTakeFirst: async () => undefined }),
            executeTakeFirst: async () => undefined,
          }),
        }),
      }),
    }),
  } as unknown as DatabaseManager;
}
