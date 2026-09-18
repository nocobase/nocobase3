import { createPostgresBackend, type BackendFactory } from 'bullmq';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryBackendFactory } from '../../src/backends/in-memory/index.js';
import { createServicePostgresBackend } from '../../src/backends/postgres.js';
import { producerDeadline } from '../../src/operation-deadline.js';

it('carries the public producer remaining budget into PostgreSQL queries without refreshing it', async () => {
  const underlying = createInMemoryBackendFactory()('remaining', {
    connection: {},
  });
  const scopes: (number | undefined)[] = [];
  vi.spyOn(underlying, 'setQueueMeta').mockImplementation(async () => {
    scopes.push(postgresDeadline.getStore());
    return 1;
  });
  vi.mocked(postgresFactory).mockReturnValue(underlying);
  const backend = createServicePostgresBackend('remaining', { connection: {} });
  const deadline = performance.now() + 50;
  try {
    await producerDeadline.run(deadline, () =>
      backend.setQueueMeta({ version: 'test' }),
    );
    expect(scopes).toEqual([deadline]);
    await expect(
      producerDeadline.run(performance.now() - 1, () =>
        backend.setQueueMeta({ version: 'late' }),
      ),
    ).rejects.toThrow('deadline');
    expect(scopes).toHaveLength(1);
  } finally {
    await backend.close();
  }
});
import {
  createBorrowedPostgresPool,
  postgresDeadline,
} from '../../src/backends/postgres-pool.js';

// Substitute a complete backend at the public factory boundary. These tests
// exercise wrapper scopes, not PostgreSQL query correctness or cancellation.
vi.mock('bullmq', async (original) => {
  const actual = await original<typeof import('bullmq')>();
  return { ...actual, createPostgresBackend: vi.fn() };
});

const postgresFactory: BackendFactory = createPostgresBackend;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('PostgreSQL inherited operation deadlines', () => {
  it('does not refresh a setup deadline when initializing Queue metadata', async () => {
    const underlying = createInMemoryBackendFactory()('unit', {
      connection: {},
    });
    const scopes: (number | undefined)[] = [];
    vi.spyOn(underlying, 'setQueueMeta').mockImplementation(async () => {
      scopes.push(postgresDeadline.getStore());
      return 1;
    });
    vi.mocked(postgresFactory).mockReturnValue(underlying);
    const backend = createServicePostgresBackend('unit', { connection: {} });
    const deadline = performance.now() + 250;
    try {
      await postgresDeadline.run(deadline, () =>
        backend.setQueueMeta({ version: 'unit' }),
      );
      expect(scopes).toEqual([deadline]);
    } finally {
      await backend.close();
    }
  });

  it('rejects an expired inherited budget before dispatching metadata', async () => {
    const underlying = createInMemoryBackendFactory()('unit', {
      connection: {},
    });
    const setMeta = vi.spyOn(underlying, 'setQueueMeta');
    vi.mocked(postgresFactory).mockReturnValue(underlying);
    const backend = createServicePostgresBackend('unit', { connection: {} });
    try {
      await expect(
        postgresDeadline.run(performance.now() - 1, () =>
          backend.setQueueMeta({ version: 'unit' }),
        ),
      ).rejects.toThrow();
      expect(setMeta).not.toHaveBeenCalled();
    } finally {
      await backend.close();
    }
  });

  it('invalidates the producer at the inherited deadline instead of waiting ten seconds', async () => {
    vi.useFakeTimers();
    const underlying = createInMemoryBackendFactory()('unit', {
      connection: {},
    });
    let settle!: () => void;
    const barrier = new Promise<void>((resolve) => {
      settle = resolve;
    });
    vi.spyOn(underlying, 'setQueueMeta').mockImplementation(async () => {
      await barrier;
      return 1;
    });
    const close = vi.spyOn(underlying, 'close');
    vi.mocked(postgresFactory).mockReturnValue(underlying);
    const backend = createServicePostgresBackend('unit', { connection: {} });
    const work = postgresDeadline.run(performance.now() + 250, () =>
      backend.setQueueMeta({ version: 'unit' }),
    );
    const result = work.then(
      () => undefined,
      (error: unknown) => error,
    );
    try {
      await vi.advanceTimersByTimeAsync(249);
      expect(close).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(close).toHaveBeenCalledOnce();
    } finally {
      settle();
      await result;
      await backend.close();
    }
    expect(await result).toMatchObject({
      message: 'PostgreSQL producer operation failed',
    });
  });

  it('keeps the ordinary ten-second producer cap when an outer budget is longer', async () => {
    const underlying = createInMemoryBackendFactory()('unit', {
      connection: {},
    });
    let observed = Infinity;
    vi.spyOn(underlying, 'setQueueMeta').mockImplementation(async () => {
      observed = postgresDeadline.getStore() ?? Infinity;
      return 1;
    });
    vi.mocked(postgresFactory).mockReturnValue(underlying);
    const backend = createServicePostgresBackend('unit', { connection: {} });
    const before = performance.now();
    try {
      await postgresDeadline.run(before + 60000, () =>
        backend.setQueueMeta({ version: 'unit' }),
      );
      expect(observed).toBeGreaterThanOrEqual(before + 10000);
      expect(observed).toBeLessThanOrEqual(performance.now() + 10000);
    } finally {
      await backend.close();
    }
  });

  it('rejects a checkout whose configured timeout no longer fits the same setup budget', async () => {
    vi.useFakeTimers();
    const owner = new Pool({ connectionTimeoutMillis: 100 });
    const checkout = vi
      .spyOn(Pool.prototype, 'connect')
      .mockImplementation(() =>
        Promise.reject(new Error('unexpected checkout')),
      );
    const adapter = createBorrowedPostgresPool(owner);
    const deadline = performance.now() + 150;
    try {
      await postgresDeadline.run(deadline, async () => {
        await vi.advanceTimersByTimeAsync(75);
        await expect(adapter.pool.connect()).rejects.toThrow(
          'borrow timeout exceeds remaining budget',
        );
      });
      expect(checkout).not.toHaveBeenCalled();
      expect(owner.totalCount).toBe(0);
      expect(owner.waitingCount).toBe(0);
    } finally {
      await adapter.close();
      await owner.end();
    }
  });
});
