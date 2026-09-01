import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CronJob,
  createCronJobManager,
  type CronJobManager,
} from '../src/index.js';

const SECOND = 1_000;
const CLOSED_ERROR_MESSAGE = 'Cron job manager is closed.';

let managers: CronJobManager[] = [];

function createManager(): CronJobManager {
  const manager = createCronJobManager();
  managers.push(manager);
  return manager;
}

afterEach(() => {
  for (const manager of managers) {
    manager.close();
  }
  managers = [];
  vi.useRealTimers();
});

describe('createCronJobManager', () => {
  it('registers jobs without starting them', async () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const manager = createManager();

    const job = manager.addJob({ cronTime: '* * * * * *', onTick });

    expect(job).toBeInstanceOf(CronJob);
    expect(manager.jobs.has(job)).toBe(true);
    expect(manager.started).toBe(false);
    expect(job.isActive).toBe(false);

    await vi.advanceTimersByTimeAsync(SECOND);
    expect(onTick).not.toHaveBeenCalled();
  });

  it('keeps lifecycle control when job options request immediate execution', () => {
    const onTick = vi.fn();
    const manager = createManager();

    const job = manager.addJob({
      cronTime: '* * * * * *',
      onTick,
      runOnInit: true,
      start: true,
    });

    expect(manager.started).toBe(false);
    expect(job.isActive).toBe(false);
    expect(onTick).not.toHaveBeenCalled();
  });

  it('starts all registered jobs once', () => {
    const manager = createManager();
    const first = manager.addJob({ cronTime: '* * * * * *', onTick: vi.fn() });
    const second = manager.addJob({ cronTime: '* * * * * *', onTick: vi.fn() });
    const firstStart = vi.spyOn(first, 'start');
    const secondStart = vi.spyOn(second, 'start');

    manager.start();
    manager.start();

    expect(manager.started).toBe(true);
    expect(firstStart).toHaveBeenCalledTimes(1);
    expect(secondStart).toHaveBeenCalledTimes(1);
  });

  it('runs registered jobs after the manager starts', async () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const manager = createManager();
    manager.addJob({ cronTime: '* * * * * *', onTick });

    manager.start();
    await vi.advanceTimersByTimeAsync(SECOND);

    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('starts jobs added after the manager has started', async () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const manager = createManager();
    manager.start();

    const job = manager.addJob({ cronTime: '* * * * * *', onTick });

    expect(job.isActive).toBe(true);
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('stops idempotently and can restart retained jobs', async () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const manager = createManager();
    const job = manager.addJob({ cronTime: '* * * * * *', onTick });
    const stop = vi.spyOn(job, 'stop');

    manager.start();
    manager.stop();
    manager.stop();

    expect(manager.started).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(job.isActive).toBe(false);
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(onTick).not.toHaveBeenCalled();

    manager.start();
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('removes only the requested job and handles repeated removal', async () => {
    vi.useFakeTimers();
    const firstTick = vi.fn();
    const secondTick = vi.fn();
    const manager = createManager();
    const first = manager.addJob({
      cronTime: '* * * * * *',
      onTick: firstTick,
    });
    const second = manager.addJob({
      cronTime: '* * * * * *',
      onTick: secondTick,
    });
    const firstStop = vi.spyOn(first, 'stop');
    const secondStop = vi.spyOn(second, 'stop');
    manager.start();

    manager.removeJob(first);
    manager.removeJob(first);
    await vi.advanceTimersByTimeAsync(SECOND);

    expect(manager.jobs.has(first)).toBe(false);
    expect(manager.jobs.has(second)).toBe(true);
    expect(firstStop).toHaveBeenCalledTimes(1);
    expect(secondStop).not.toHaveBeenCalled();
    expect(firstTick).not.toHaveBeenCalled();
    expect(secondTick).toHaveBeenCalledTimes(1);
  });

  it('closes idempotently, stops jobs, and clears the collection', () => {
    const manager = createManager();
    const first = manager.addJob({ cronTime: '* * * * * *', onTick: vi.fn() });
    const second = manager.addJob({ cronTime: '* * * * * *', onTick: vi.fn() });
    const firstStop = vi.spyOn(first, 'stop');
    const secondStop = vi.spyOn(second, 'stop');
    manager.start();

    manager.close();
    manager.close();

    expect(manager.started).toBe(false);
    expect(manager.jobs.size).toBe(0);
    expect(firstStop).toHaveBeenCalledTimes(1);
    expect(secondStop).toHaveBeenCalledTimes(1);
  });

  it('rejects adding or starting jobs after close', () => {
    const manager = createManager();
    manager.close();

    expect(() =>
      manager.addJob({ cronTime: '* * * * * *', onTick: vi.fn() }),
    ).toThrow(CLOSED_ERROR_MESSAGE);
    expect(() => manager.start()).toThrow(CLOSED_ERROR_MESSAGE);
    expect(() => manager.stop()).not.toThrow();
    expect(() => manager.close()).not.toThrow();
  });
});
