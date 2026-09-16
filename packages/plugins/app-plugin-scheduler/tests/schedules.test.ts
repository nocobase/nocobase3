import { describe, expect, it, vi } from 'vitest';
import { defineSchedule } from '../server/schedules/define.js';
import { ScheduleTargetRegistry } from '../server/schedules/registry.js';

describe('schedule definitions and registries', () => {
  it('normalizes, freezes, and hashes definitions', () => {
    const definition = defineSchedule({
      key: 'daily-sync',
      title: 'Daily sync',
      schedule: { cron: '0 0 * * *', timezone: 'Asia/Singapore' },
      target: { type: 'report', config: {} },
    });
    expect(definition.schedule.timezone).toBe('Asia/Singapore');
    expect(definition.definitionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(definition)).toBe(true);
  });

  it('hashes equivalent target config independently of property order', () => {
    const first = defineSchedule({
      key: 'stable',
      title: 'Stable',
      schedule: { cron: '0 0 * * *' },
      target: { type: 'report', config: { a: 1, nested: { b: 2, c: 3 } } },
    });
    const second = defineSchedule({
      key: 'stable',
      title: 'Stable',
      schedule: { cron: '0 0 * * *' },
      target: { type: 'report', config: { nested: { c: 3, b: 2 }, a: 1 } },
    });
    expect(first.definitionHash).toBe(second.definitionHash);
  });

  it('rejects invalid timezone and sensitive target config', () => {
    expect(() =>
      defineSchedule({
        key: 'timezone',
        title: 'Timezone',
        schedule: { cron: '0 0 * * *', timezone: 'Not/A_Timezone' },
        target: { type: 'report', config: {} },
      }),
    ).toThrow('cron or timezone is invalid');
    expect(() =>
      defineSchedule({
        key: 'secret',
        title: 'Secret',
        schedule: { cron: '0 0 * * *' },
        target: { type: 'report', config: { nested: { accessToken: 'nope' } } },
      }),
    ).toThrow('must not contain credentials');
    expect(() =>
      defineSchedule({
        key: 'secret-suffix',
        title: 'Secret suffix',
        schedule: { cron: '0 0 * * *' },
        target: { type: 'report', config: { webhookSecret: 'nope' } },
      }),
    ).toThrow('must not contain credentials');
  });

  it('rejects invalid cron and target definitions', () => {
    expect(() =>
      defineSchedule({
        key: 'x',
        title: 'x',
        schedule: { cron: '* * *' },
        target: { type: 'report', config: {} },
      }),
    ).toThrow();
    expect(() =>
      defineSchedule({
        key: 'x',
        title: 'x',
        schedule: { cron: '* * * * *' },
        target: { type: '', config: {} },
      }),
    ).toThrow();
  });

  it('starts only registered targets, validating their config first', async () => {
    const start = vi.fn(async () => ({
      state: 'accepted' as const,
      reference: { type: 'queue-job', id: 'queued-job' },
    }));
    const targets = new ScheduleTargetRegistry();
    targets.register({
      type: 'report',
      title: 'Report',
      validate: (config) =>
        typeof (config as { message?: unknown }).message === 'string'
          ? { valid: true }
          : { valid: false, reason: 'invalid-config' },
      start,
    });
    const context = { scheduleId: 's', occurrenceId: 'o' };

    await expect(targets.start('missing', {}, context)).resolves.toEqual({
      state: 'failed',
      reason: 'target-not-found',
    });
    await expect(targets.start('report', {}, context)).resolves.toEqual({
      state: 'failed',
      reason: 'invalid-config',
    });
    await expect(
      targets.start('report', { message: 'hello' }, context),
    ).resolves.toEqual({
      state: 'accepted',
      reference: { type: 'queue-job', id: 'queued-job' },
    });
    expect(start).toHaveBeenCalledWith({ message: 'hello' }, context);
  });

  it('rejects a duplicate target type', () => {
    const targets = new ScheduleTargetRegistry();
    const target = {
      type: 'report',
      title: 'Report',
      validate: () => ({ valid: true }),
      start: async () => ({
        state: 'completed' as const,
        outcome: 'succeeded' as const,
      }),
    };
    targets.register(target);

    expect(() => targets.register(target)).toThrow(
      'Schedule target type already registered: report',
    );
  });

  it('describes a target by its own title when it declares no describe()', async () => {
    const targets = new ScheduleTargetRegistry();
    targets.register({
      type: 'report',
      title: 'Daily report',
      validate: () => ({ valid: true }),
      start: async () => ({ state: 'completed', outcome: 'succeeded' }),
    });

    await expect(targets.describe('report', {})).resolves.toEqual({
      targetLabel: 'Daily report',
      state: 'ready',
    });
    // A definition pointing at a target nobody registered reads as missing
    // rather than as a target that happens to have no description.
    await expect(targets.describe('gone', {})).resolves.toEqual({
      targetLabel: 'gone',
      state: 'missing',
    });
  });

  it('lets a target use the occurrence ID as its downstream dedup key', async () => {
    const queueDispatch = vi.fn(async () => ({ id: 'downstream-job' }));
    const targets = new ScheduleTargetRegistry();
    targets.register({
      type: 'maintenance',
      title: 'Maintenance',
      validate: () => ({ valid: true }),
      start: async (config, context) => {
        const result = await queueDispatch(config, {
          dedup: { id: context.occurrenceId },
        });
        return {
          state: 'accepted',
          reference: { type: 'queue-job', id: result.id },
        };
      },
    });

    await expect(
      targets.start(
        'maintenance',
        { accountId: 7 },
        { scheduleId: 'schedule-1', occurrenceId: 'occurrence-2' },
      ),
    ).resolves.toEqual({
      state: 'accepted',
      reference: { type: 'queue-job', id: 'downstream-job' },
    });
    expect(queueDispatch).toHaveBeenCalledWith(
      { accountId: 7 },
      { dedup: { id: 'occurrence-2' } },
    );
  });

  it('routes observation by the target type the occurrence recorded', async () => {
    const inspect = vi.fn(async () => ({
      state: 'completed' as const,
      completion: { status: 'succeeded' as const },
    }));
    const targets = new ScheduleTargetRegistry();
    targets.register({
      type: 'maintenance',
      title: 'Maintenance',
      validate: () => ({ valid: true }),
      start: async () => ({
        state: 'accepted',
        reference: { type: 'queue-job', id: 'downstream-job' },
      }),
      inspect,
    });
    // Reconciliation only has the occurrence row, which records the target
    // type that started the run rather than the definition's current one.
    targets.register({
      type: 'other',
      title: 'Other',
      validate: () => ({ valid: true }),
      start: async () => ({ state: 'completed', outcome: 'succeeded' }),
      inspect: async () => ({ state: 'unknown', reason: 'wrong-target' }),
    });
    const reference = { type: 'queue-job', id: 'downstream-job' };

    await expect(targets.inspect('maintenance', reference)).resolves.toEqual({
      state: 'completed',
      completion: { status: 'succeeded' },
    });
    expect(inspect).toHaveBeenCalledWith(reference);
  });

  it('reports an unavailable observer for a target that cannot inspect', async () => {
    const targets = new ScheduleTargetRegistry();
    targets.register({
      type: 'report',
      title: 'Report',
      validate: () => ({ valid: true }),
      start: async () => ({ state: 'completed', outcome: 'succeeded' }),
    });

    await expect(
      targets.inspect('report', { type: 'queue-job', id: 'downstream-job' }),
    ).resolves.toEqual({ state: 'unknown', reason: 'observer-unavailable' });
  });
});
