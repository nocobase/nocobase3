import { expect, it } from 'vitest';
import { createQueueService } from '../src/service.js';
import { createInMemoryBackendFactory } from '../src/backends/in-memory/index.js';

it('passes an opaque custom connection to its factory without eager acquisition', async () => {
  const connection = {
    endpoint: 'custom://private',
    credentials: { token: 'fixture' },
  };
  const seen: unknown[] = [];
  const memory = createInMemoryBackendFactory();
  const service = createQueueService({
    namespace: 'custom',
    queueBackend: 'custom',
    connection,
  });
  service.registerBackend('custom', (name, options, metadata) => {
    seen.push(options.connection);
    return memory(name, { ...options, connection: {} }, metadata);
  });
  service.producer('jobs');
  expect(seen).toEqual([]);
  try {
    await service.setup();
    expect(seen).toEqual([connection]);
    await expect(
      service.producer('jobs').publish('work', {}),
    ).resolves.toHaveProperty('jobId');
  } finally {
    await service.shutdown();
  }
});
