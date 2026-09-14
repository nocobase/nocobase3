import { describe, expect, it, vi } from 'vitest';
import { defineSchedule } from '../server/schedules/define.js';
import {
  createJobTarget,
  JobDispatchRegistry,
} from '../server/schedules/job-target.js';
import { ScheduleTargetRegistry } from '../server/schedules/registry.js';

describe('schedule definitions and registries', () => {
  it('normalizes, freezes, and hashes definitions', () => {
    const definition = defineSchedule({
      key: 'daily-sync',
      title: 'Daily sync',
      schedule: { cron: '0 0 * * *', timezone: 'Asia/Singapore' },
      target: { type: 'job', config: {} },
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
      target: { type: 'job', config: { a: 1, nested: { b: 2, c: 3 } } },
    });
    const second = defineSchedule({
      key: 'stable',
      title: 'Stable',
      schedule: { cron: '0 0 * * *' },
      target: { type: 'job', config: { nested: { c: 3, b: 2 }, a: 1 } },
    });
    expect(first.definitionHash).toBe(second.definitionHash);
  });

  it('rejects invalid timezone and sensitive target config', () => {
    expect(() =>
      defineSchedule({
        key: 'timezone',
        title: 'Timezone',
        schedule: { cron: '0 0 * * *', timezone: 'Not/A_Timezone' },
        target: { type: 'job', config: {} },
      }),
    ).toThrow('cron or timezone is invalid');
    expect(() =>
      defineSchedule({
        key: 'secret',
        title: 'Secret',
        schedule: { cron: '0 0 * * *' },
        target: { type: 'job', config: { nested: { accessToken: 'nope' } } },
      }),
    ).toThrow('must not contain credentials');
    expect(() =>
      defineSchedule({
        key: 'secret-suffix',
        title: 'Secret suffix',
        schedule: { cron: '0 0 * * *' },
        target: { type: 'job', config: { webhookSecret: 'nope' } },
      }),
    ).toThrow('must not contain credentials');
  });

  it('rejects invalid cron and target definitions', () => {
    expect(() =>
      defineSchedule({
        key: 'x',
        title: 'x',
        schedule: { cron: '* * *' },
        target: { type: 'job', config: {} },
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

  it('dispatches only registered job targets', async () => {
    const jobs = new JobDispatchRegistry();
    const dispatch = vi.fn(async () => ({
      state: 'accepted' as const,
      reference: { type: 'queue-job', id: 'queued-job' },
    }));
    jobs.register({
      name: 'hello',
      title: 'Hello',
      validate: (payload) =>
        typeof (payload as { message?: unknown }).message === 'string'
          ? { valid: true }
          : { valid: false, reason: 'invalid-payload' },
      dispatch,
    });
    const targets = new ScheduleTargetRegistry();
    targets.register({
      type: 'job',
      title: 'Job',
      validate: () => ({ valid: true }),
      describe: async () => ({ targetLabel: 'Job' }),
      start: async () => ({
        state: 'completed',
        outcome: 'succeeded',
      }),
    });
    expect(
      (
        await jobs.dispatch(
          'missing',
          {},
          {
            scheduleId: 's',
            occurrenceId: 'o',
          },
        )
      ).reason,
    ).toBe('job-not-found');
    await expect(
      jobs.dispatch(
        'hello',
        {},
        {
          scheduleId: 's',
          occurrenceId: 'o',
        },
      ),
    ).resolves.toEqual({ state: 'failed', reason: 'invalid-payload' });
    const context = {
      scheduleId: 's',
      occurrenceId: 'o',
    };
    await expect(
      jobs.dispatch('hello', { message: 'hello' }, context),
    ).resolves.toEqual({
      state: 'accepted',
      reference: { type: 'queue-job', id: 'queued-job' },
    });
    expect(dispatch).toHaveBeenCalledWith({ message: 'hello' }, context);
    expect(
      await targets.start(
        'job',
        {},
        {
          scheduleId: 's',
          occurrenceId: 'o',
        },
      ),
    ).toEqual({ state: 'completed', outcome: 'succeeded' });
  });

  it('lets a registered Queue dispatcher use the occurrence ID as its dedup key', async () => {
    const queueDispatch = vi.fn(async () => ({ id: 'downstream-job' }));
    const jobs = new JobDispatchRegistry();
    jobs.register({
      name: 'maintenance',
      title: 'Maintenance',
      validate: () => ({ valid: true }),
      dispatch: async (payload, context) => {
        const result = await queueDispatch(payload, {
          dedup: { id: context.occurrenceId },
        });
        return {
          state: 'accepted',
          reference: { type: 'queue-job', id: result.id },
        };
      },
    });

    await expect(
      jobs.dispatch(
        'maintenance',
        { accountId: 7 },
        {
          scheduleId: 'schedule-1',
          occurrenceId: 'occurrence-2',
        },
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

  it('delegates Job target observation by stable reference type', async () => {
    const inspect = vi.fn(async () => ({
      state: 'completed' as const,
      completion: { status: 'succeeded' as const },
    }));
    const jobs = new JobDispatchRegistry();
    jobs.register({
      name: 'maintenance',
      title: 'Maintenance',
      validate: () => ({ valid: true }),
      dispatch: async () => ({
        state: 'accepted',
        reference: { type: 'queue-job', id: 'downstream-job' },
      }),
    });
    jobs.registerObserver('queue-job', inspect);
    const target = createJobTarget(jobs);
    const reference = { type: 'queue-job', id: 'downstream-job' };

    await expect(target.inspect?.(reference)).resolves.toEqual({
      state: 'completed',
      completion: { status: 'succeeded' },
    });
    expect(inspect).toHaveBeenCalledWith(reference);
  });

  it('reports an unavailable observer for an unmatched Job reference', async () => {
    const jobs = new JobDispatchRegistry();
    jobs.register({
      name: 'maintenance',
      title: 'Maintenance',
      validate: () => ({ valid: true }),
      dispatch: async () => ({
        state: 'completed',
        outcome: 'succeeded',
      }),
    });

    await expect(
      createJobTarget(jobs).inspect?.({
        type: 'queue-job',
        id: 'downstream-job',
      }),
    ).resolves.toEqual({
      state: 'unknown',
      reason: 'observer-unavailable',
    });
  });

  it('rejects ambiguous Job observers for the same reference type', () => {
    const jobs = new JobDispatchRegistry();
    jobs.registerObserver('queue-job', async () => ({ state: 'running' }));

    expect(() =>
      jobs.registerObserver('queue-job', async () => ({ state: 'pending' })),
    ).toThrow('Schedule Job observer already registered: queue-job');
  });
});
