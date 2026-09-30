import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import {
  createJobExecutorService,
  type JobExecutionContext,
} from '@nocobase/jobs';
import { ServiceContainer } from '@nocobase/service-provider';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  __NOCOBASE_SYMBOL_NAME__Job,
  submit__NOCOBASE_SYMBOL_NAME__,
} from '../server/jobs/__NOCOBASE_SHORT_NAME__.js';
import { __NOCOBASE_SYMBOL_NAME__JobsProvider } from '../server/providers/__NOCOBASE_SHORT_NAME__-jobs.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.restoreAllMocks();
});

// Each application has its own jobs service; the built-in memory configuration keeps tasks in this process.
async function createFixture(appName = 'plugin-test') {
  const storagePath = await mkdtemp(path.join(os.tmpdir(), 'plugin-jobs-'));
  const service = createJobExecutorService(undefined, { appName, storagePath });
  const container = new ServiceContainer();
  container.instance(jobExecutorServiceToken, service);
  const provider = new __NOCOBASE_SYMBOL_NAME__JobsProvider({ container });
  cleanups.push(async () => {
    await provider.shutdown();
    await service.shutdown();
    await rm(storagePath, { recursive: true, force: true });
  });
  return { container, provider };
}

function executionContext(signal: AbortSignal): JobExecutionContext {
  return {
    jobId: 'test',
    jobName: __NOCOBASE_SYMBOL_NAME__Job.jobName,
    enqueuedAt: new Date(),
    runAt: new Date(),
    attempt: 1,
    signal,
    reportProgress: async () => undefined,
  };
}

describe(__NOCOBASE_PACKAGE_NAME_LITERAL__, () => {
  it('validates payloads and cancellation', async () => {
    const controller = new AbortController();
    await expect(
      new __NOCOBASE_SYMBOL_NAME__Job({ requestedAt: ' ' }).execute(
        executionContext(controller.signal),
      ),
    ).rejects.toThrow('requestedAt');
    const job = new __NOCOBASE_SYMBOL_NAME__Job({ requestedAt: 'now' });
    await expect(
      job.execute(executionContext(controller.signal)),
    ).resolves.toBeUndefined();
    controller.abort();
    await expect(job.execute(executionContext(controller.signal))).rejects.toThrow();
  });

  it('accepts tasks once started and runs them asynchronously', async () => {
    const { container, provider } = await createFixture();
    const executed = vi.spyOn(
      __NOCOBASE_SYMBOL_NAME__Job.prototype,
      'execute',
    );
    await expect(
      submit__NOCOBASE_SYMBOL_NAME__(container, { requestedAt: 'now' }),
    ).rejects.toThrow();
    await provider.start();
    const receipt = await submit__NOCOBASE_SYMBOL_NAME__(container, {
      requestedAt: 'now',
    });
    expect(receipt).toMatchObject({
      jobId: expect.any(String),
      jobName: __NOCOBASE_SYMBOL_NAME__Job.jobName,
    });
    await expect
      .poll(() => executed.mock.settledResults[0]?.type)
      .toBe('fulfilled');
    expect(executed.mock.contexts[0]?.payload).toEqual({ requestedAt: 'now' });
  });

  it('keeps executors isolated between applications', async () => {
    const first = await createFixture('plugin-first');
    const second = await createFixture('plugin-second');
    const executed = vi.spyOn(
      __NOCOBASE_SYMBOL_NAME__Job.prototype,
      'execute',
    );
    await first.provider.start();
    await second.provider.start();
    await submit__NOCOBASE_SYMBOL_NAME__(first.container, {
      requestedAt: 'first',
    });
    await expect
      .poll(() => executed.mock.settledResults[0]?.type)
      .toBe('fulfilled');
    // Shutting one application's executor down leaves the other running.
    await first.provider.shutdown();
    await submit__NOCOBASE_SYMBOL_NAME__(second.container, {
      requestedAt: 'second',
    });
    await expect
      .poll(() => executed.mock.settledResults[1]?.type)
      .toBe('fulfilled');
    expect(executed.mock.contexts.map((job) => job.payload)).toEqual([
      { requestedAt: 'first' },
      { requestedAt: 'second' },
    ]);
  });

  it('waits for a running task before shutdown completes', async () => {
    const { container, provider } = await createFixture();
    const release = Promise.withResolvers<void>();
    const executed = vi
      .spyOn(__NOCOBASE_SYMBOL_NAME__Job.prototype, 'execute')
      .mockImplementation(async () => {
        await release.promise;
      });
    await provider.start();
    await submit__NOCOBASE_SYMBOL_NAME__(container, { requestedAt: 'now' });
    await expect.poll(() => executed.mock.calls.length).toBe(1);
    let stopped = false;
    const shutdown = provider.shutdown().then(() => {
      stopped = true;
    });
    await setImmediate();
    expect(stopped).toBe(false);
    release.resolve();
    await shutdown;
    expect(stopped).toBe(true);
  });
});
