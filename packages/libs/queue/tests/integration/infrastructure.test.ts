import { Queue, Worker } from 'bullmq';
import { expect, it } from 'vitest';
import {
  createBackendHarness,
  selectedBackend,
} from '../helpers/backend-harness.js';

const backend = selectedBackend();

it(`verifies the selected ${backend} infrastructure without a mock backend`, async () => {
  expect(process.env.QUEUE_TEST_RUN).toMatch(/^nbq-/u);
  if (backend === 'inMemory') {
    // Phase 1 only checks fixture admission. Actual memory contracts require its Phase 3 factory.
    await expect(createBackendHarness()).rejects.toThrow(
      'real inMemory BackendFactory',
    );
    return;
  }
  const harness = await createBackendHarness();
  const name = `{${harness.namespace}}`;
  const queue = new Queue(
    name,
    { connection: harness.connection },
    harness.factory,
  );
  const worker = new Worker(
    name,
    async () => 'ok',
    { connection: harness.connection },
    harness.factory,
  );
  const errors: Error[] = [];
  queue.on('error', (error) => errors.push(error));
  worker.on('error', (error) => errors.push(error));
  try {
    await Promise.all([queue.waitUntilReady(), worker.waitUntilReady()]);
    const job = await queue.add('infrastructure', { ready: true });
    await expect
      .poll(() => job.getState(), { timeout: 5000 })
      .toBe('completed');
    expect(errors).toEqual([]);
  } finally {
    try {
      await worker.close(true);
    } finally {
      try {
        await queue.close();
      } finally {
        await harness.close();
      }
    }
  }
});
