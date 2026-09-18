import { Client, Pool, type PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBorrowedPostgresPool } from '../../src/backends/postgres-pool.js';

// These are facade unit seams, not evidence that modified Pools pass admission.
// Complete pg objects provide the public boundary; only checkout and lease
// release are controlled so acquisition and physical end can settle separately.
function fixture() {
  const owner = new Pool({ connectionTimeoutMillis: 100 });
  const raw: PoolClient = Object.assign(new Client(), { release: vi.fn() });
  let resolve!: (client: PoolClient) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<PoolClient>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const acquisition = { promise, resolve, reject };
  const connect = vi
    .spyOn(Pool.prototype, 'connect')
    .mockImplementation(() => acquisition.promise);
  const end = vi.spyOn(owner, 'end');
  const ownerError = vi.fn();
  owner.on('error', ownerError);
  const options = { ...owner.options };
  const adapter = createBorrowedPostgresPool(owner);
  return {
    owner,
    raw,
    acquisition,
    connect,
    end,
    ownerError,
    options,
    adapter,
  };
}

function observe(work: Promise<unknown>) {
  const result: {
    state: 'pending' | 'fulfilled' | 'rejected';
    error?: unknown;
  } = {
    state: 'pending',
  };
  void work.then(
    () => {
      result.state = 'fulfilled';
    },
    (error: unknown) => {
      result.state = 'rejected';
      result.error = error;
    },
  );
  return result;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('borrowed PostgreSQL Pool bounded cleanup', () => {
  it('rejects unconfirmed retirement at 5000ms, retains late cleanup, and never ends the owner', async () => {
    const f = fixture();
    f.acquisition.resolve(f.raw);
    const lease = await f.adapter.pool.connect();
    const closing = f.adapter.close();
    const result = observe(closing);
    expect(f.adapter.close()).toBe(closing);
    expect(f.raw.release).toHaveBeenCalledExactlyOnceWith(true);
    await vi.advanceTimersByTimeAsync(4999);
    expect(result.state).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(result.state).toBe('rejected');
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error).toHaveProperty(
      'message',
      expect.stringMatching(
        /5000ms.*unresolved acquisitions: 0.*leases awaiting end: 1/u,
      ),
    );
    expect(f.owner.listenerCount('error')).toBe(2);
    expect(f.raw.listenerCount('end')).toBeGreaterThan(0);
    await expect(lease.query('SELECT 1')).rejects.toThrow('closed');
    await expect(f.adapter.pool.connect()).rejects.toThrow('closed');
    expect(f.connect).toHaveBeenCalledTimes(1);
    f.raw.emit('error', new Error('Late transport failure'));
    f.raw.emit('end');
    await vi.advanceTimersByTimeAsync(0);
    expect(f.owner.listeners('error')).toEqual([f.ownerError]);
    expect(f.raw.listenerCount('error')).toBe(0);
    expect(f.raw.listenerCount('notification')).toBe(0);
    expect(f.raw.listenerCount('end')).toBe(0);
    expect(f.owner.options).toEqual(f.options);
    expect(f.end).not.toHaveBeenCalled();
    expect(f.adapter.close()).toBe(closing);
    await expect(closing).rejects.toBe(result.error);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a pending acquisition without pretending it was cancelled and retires a late lease', async () => {
    const f = fixture();
    const acquiring = f.adapter.pool.connect();
    const acquired = observe(acquiring);
    const closing = f.adapter.close();
    const result = observe(closing);
    await vi.advanceTimersByTimeAsync(5000);
    expect(result.state).toBe('rejected');
    expect(result.error).toHaveProperty(
      'message',
      expect.stringMatching(
        /unresolved acquisitions: 1.*leases awaiting end: 0/u,
      ),
    );
    expect(f.raw.release).not.toHaveBeenCalled();
    expect(f.owner.listenerCount('error')).toBe(2);
    f.acquisition.resolve(f.raw);
    await expect(acquiring).rejects.toThrow('closed during acquisition');
    expect(acquired.state).toBe('rejected');
    expect(f.raw.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(f.owner.listenerCount('error')).toBe(2);
    f.raw.emit('end');
    await vi.advanceTimersByTimeAsync(0);
    expect(f.owner.listeners('error')).toEqual([f.ownerError]);
    expect(f.end).not.toHaveBeenCalled();
    expect(f.owner.options).toEqual(f.options);
    expect(f.adapter.close()).toBe(closing);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shares one reserve across acquisition and retirement rather than restarting it', async () => {
    const f = fixture();
    const acquiring = f.adapter.pool.connect();
    const acquired = observe(acquiring);
    const closing = f.adapter.close();
    const result = observe(closing);
    await vi.advanceTimersByTimeAsync(4000);
    f.acquisition.resolve(f.raw);
    await expect(acquiring).rejects.toThrow('closed during acquisition');
    expect(acquired.state).toBe('rejected');
    expect(f.raw.release).toHaveBeenCalledExactlyOnceWith(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(result.state).toBe('pending');
    expect(f.adapter.close()).toBe(closing);
    await vi.advanceTimersByTimeAsync(1);
    expect(result.state).toBe('rejected');
    expect(result.error).toHaveProperty(
      'message',
      expect.stringMatching(
        /unresolved acquisitions: 0.*leases awaiting end: 1/u,
      ),
    );
    f.raw.emit('end');
    await vi.advanceTimersByTimeAsync(0);
    expect(f.owner.listeners('error')).toEqual([f.ownerError]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('succeeds only after all actual end events within the shared reserve and removes its timer', async () => {
    const f = fixture();
    f.acquisition.resolve(f.raw);
    await f.adapter.pool.connect();
    const second: PoolClient = Object.assign(new Client(), {
      release: vi.fn(),
    });
    f.connect.mockImplementation(() => Promise.resolve(second));
    await f.adapter.pool.connect();
    const closing = f.adapter.close();
    const result = observe(closing);
    f.raw.emit('end');
    await vi.advanceTimersByTimeAsync(4999);
    expect(result.state).toBe('pending');
    expect(second.release).toHaveBeenCalledExactlyOnceWith(true);
    second.emit('end');
    await closing;
    expect(result.state).toBe('fulfilled');
    expect(f.owner.listeners('error')).toEqual([f.ownerError]);
    expect(f.end).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps observing a late acquisition rejection and detaches only after it settles', async () => {
    const f = fixture();
    const original = new Error('Checkout failed');
    const acquiring = f.adapter.pool.connect();
    const acquired = observe(acquiring);
    const closing = f.adapter.close();
    const result = observe(closing);
    await vi.advanceTimersByTimeAsync(5000);
    expect(result.state).toBe('rejected');
    expect(f.owner.listenerCount('error')).toBe(2);
    f.acquisition.reject(original);
    await expect(acquiring).rejects.toBe(original);
    expect(acquired.error).toBe(original);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.owner.listeners('error')).toEqual([f.ownerError]);
    expect(f.raw.release).not.toHaveBeenCalled();
    expect(f.end).not.toHaveBeenCalled();
    expect(f.adapter.close()).toBe(closing);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes an unused facade immediately without ending the caller Pool', async () => {
    const f = fixture();
    await f.adapter.close();
    expect(f.owner.listeners('error')).toEqual([f.ownerError]);
    expect(f.connect).not.toHaveBeenCalled();
    expect(f.end).not.toHaveBeenCalled();
    await expect(f.adapter.pool.end()).rejects.toThrow('caller-owned');
    expect(vi.getTimerCount()).toBe(0);
  });
});
