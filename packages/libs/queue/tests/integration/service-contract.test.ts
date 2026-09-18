import { expect, it } from 'vitest';
import { createQueueService } from '../../src/service.js';
import { createInMemoryBackendFactory } from '../../src/backends/in-memory/index.js';
import {
  createBackendHarness,
  selectedBackend,
} from '../helpers/backend-harness.js';

it('dispatches versioned payloads through the selected real backend and awaits handler removal', async () => {
  const harness = await createBackendHarness(createInMemoryBackendFactory());
  const selected = selectedBackend();
  const service = createQueueService({
    namespace: harness.namespace,
    queueBackend:
      selected === 'postgres13'
        ? 'postgres'
        : selected === 'cluster'
          ? 'redis'
          : selected,
    connection: harness.connection,
  });
  const received: unknown[] = [];
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const unregister = service
    .consumer('jobs')
    .consume(async (_channel, message) => {
      received.push(message);
      await gate;
    });
  try {
    await service.setup();
    await service.producer('jobs').publish('event', {
      version: 99,
      payload: 'business',
      text: '\u0000\ud800',
    });
    await expect.poll(() => received.length, { timeout: 5000 }).toBe(1);
    let removed = false;
    const removing = unregister().then(() => {
      removed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(removed).toBe(false);
    release();
    await removing;
    expect(received).toEqual([
      { version: 99, payload: 'business', text: '\u0000\ud800' },
    ]);
    await service.producer('jobs').publish('event', 'late');
    const later: unknown[] = [];
    service.consumer('jobs').consume(async (_channel, message) => {
      later.push(message);
    });
    await expect.poll(() => later, { timeout: 5000 }).toEqual(['late']);
    expect(received.length).toBe(1);
  } finally {
    release();
    await service.shutdown();
    await harness.close();
  }
});

it('preserves string channels independently from logical queue-name restrictions', async () => {
  const harness = await createBackendHarness(createInMemoryBackendFactory());
  const selected = selectedBackend();
  const service = createQueueService({
    namespace: harness.namespace,
    queueBackend:
      selected === 'postgres13'
        ? 'postgres'
        : selected === 'cluster'
          ? 'redis'
          : selected,
    connection: harness.connection,
  });
  const channels = ['', ' ', 'x'.repeat(257), 'line\nbreak'];
  const received: string[] = [];
  service.consumer('channels').consume(async (channel) => {
    received.push(channel);
  });
  try {
    await service.setup();
    await service
      .producer('channels')
      .publishMany(channels.map((channel) => ({ channel, message: null })));
    await expect.poll(() => received, { timeout: 5000 }).toEqual(channels);
  } finally {
    await service.shutdown();
    await harness.close();
  }
});

it('awaits every snapshot handler before retry and excludes later registrations', async () => {
  const harness = await createBackendHarness(createInMemoryBackendFactory());
  const selected = selectedBackend();
  const service = createQueueService({
    namespace: harness.namespace,
    queueBackend:
      selected === 'postgres13'
        ? 'postgres'
        : selected === 'cluster'
          ? 'redis'
          : selected,
    connection: harness.connection,
  });
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let failures = 0;
  let siblings = 0;
  let late = 0;
  service.consumer('snapshots').consume(() => {
    failures += 1;
    if (failures === 1) throw new Error('first attempt failure');
    return Promise.resolve();
  });
  service.consumer('snapshots').consume(async () => {
    siblings += 1;
    if (siblings === 1) await gate;
  });
  try {
    await service.setup();
    await service.producer('snapshots').publish('work', {}, { attempts: 2 });
    await expect.poll(() => siblings, { timeout: 5000 }).toBe(1);
    const offLate = service.consumer('snapshots').consume(async () => {
      late += 1;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(failures).toBe(1);
    expect(late).toBe(0);
    release();
    await expect
      .poll(() => [failures, siblings, late], { timeout: 5000 })
      .toEqual([2, 2, 1]);
    await offLate();
  } finally {
    release();
    await service.shutdown();
    await harness.close();
  }
});
