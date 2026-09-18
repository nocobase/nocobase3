import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { createQueueDiagnostics } from '../src/diagnostics.js';
import { createQueueService } from '../src/service.js';
import { createInMemoryBackendFactory } from '../src/backends/in-memory/index.js';
import type { IQueueBackend } from 'bullmq';

it('keeps real queue backend errors observable when the injected logger throws', async () => {
  const failure = new Error('transport event');
  const output = vi.spyOn(console, 'error').mockImplementation(() => {});
  const logger = {
    warn: vi.fn(),
    error: vi.fn(() => {
      throw new Error('logger broke');
    }),
  };
  const factory = createInMemoryBackendFactory();
  let backend: IQueueBackend | undefined;
  const service = createQueueService(
    { namespace: 'diagnostic-event', queueBackend: 'probe' },
    { logger },
  );
  service.registerBackend('probe', (...args) => {
    backend = factory(...args);
    return backend;
  });
  service.producer('jobs');
  try {
    await service.setup();
    if (!(backend instanceof EventEmitter))
      throw new Error('Expected event-emitting memory backend');
    const events = backend;
    expect(() => events.emit('error', failure)).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: failure }),
      'Queue backend error',
    );
    expect(output).toHaveBeenCalledWith(
      'Queue backend error',
      expect.objectContaining({ error: failure }),
    );
    await expect(
      service.producer('jobs').publish('work', {}),
    ).resolves.toHaveProperty('jobId');
  } finally {
    await service.shutdown();
    output.mockRestore();
  }
});

it('does not fail setup when the memory diagnostic hook throws', async () => {
  const output = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const service = createQueueService(
    { namespace: 'safe-hook' },
    {
      onInMemoryQueueInitialized: () => {
        throw new Error('hook failure');
      },
    },
  );
  service.producer('jobs');
  try {
    await expect(service.setup()).resolves.toBeUndefined();
    await expect(
      service.producer('jobs').publish('work', {}),
    ).resolves.toHaveProperty('jobId');
    expect(output).toHaveBeenCalled();
  } finally {
    await service.shutdown();
    output.mockRestore();
  }
});

it('falls back to console when no logger is supplied', () => {
  const output = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    createQueueDiagnostics().error({ queue: 'jobs' }, 'worker failed');
    expect(output).toHaveBeenCalledWith('worker failed', { queue: 'jobs' });
  } finally {
    output.mockRestore();
  }
});

it('does not let throwing injected or fallback diagnostics affect operations', () => {
  const failure = new Error('logger failed');
  const logger = {
    warn: vi.fn(() => {
      throw failure;
    }),
    error: vi.fn(() => {
      throw failure;
    }),
  };
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
    throw failure;
  });
  const error = vi.spyOn(console, 'error').mockImplementation(() => {
    throw failure;
  });
  try {
    const diagnostics = createQueueDiagnostics(logger);
    expect(() => diagnostics.warn({}, 'warning')).not.toThrow();
    expect(() => diagnostics.error({}, 'failure')).not.toThrow();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  } finally {
    warn.mockRestore();
    error.mockRestore();
  }
});
