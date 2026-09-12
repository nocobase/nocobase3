import { expect, it, vi } from 'vitest';
import { DefaultRepositoryQuery } from '../../../src/repository/query.js';

it('executes lazily and shares one promise across await/then/catch/finally', async () => {
  const execute = vi.fn(async () => [1, 2]);
  const iterate = vi.fn(async function* () {
    yield 1;
  });
  const query = new DefaultRepositoryQuery(execute, iterate);
  expect(execute).not.toHaveBeenCalled();
  expect(
    await Promise.all([
      query,
      query.then((rows) => rows),
      query.catch(() => []),
      query.finally(() => {}),
    ]),
  ).toEqual([
    [1, 2],
    [1, 2],
    [1, 2],
    [1, 2],
  ]);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(iterate).not.toHaveBeenCalled();
  expect(() => query[Symbol.asyncIterator]()).toThrow(
    expect.objectContaining({ code: 'QUERY_ALREADY_CONSUMED' }),
  );
});

it('caches synchronous and asynchronous failures without retrying', async () => {
  for (const synchronous of [true, false]) {
    const error = new Error('failed');
    const execute = vi.fn(() => {
      if (synchronous) throw error;
      return Promise.reject(error);
    });
    const query = new DefaultRepositoryQuery(execute, async function* () {
      yield 1;
    });
    await expect(query).rejects.toBe(error);
    await expect(query).rejects.toBe(error);
    expect(execute).toHaveBeenCalledTimes(1);
  }
});

it('claims iteration once and propagates early return to its producer', async () => {
  const cleanup = vi.fn();
  const execute = vi.fn(async () => [1]);
  const query = new DefaultRepositoryQuery(execute, async function* () {
    try {
      yield 1;
      yield 2;
    } finally {
      cleanup();
    }
  });
  for await (const row of query) {
    expect(row).toBe(1);
    break;
  }
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(execute).not.toHaveBeenCalled();
  await expect(query).rejects.toMatchObject({ code: 'QUERY_ALREADY_CONSUMED' });
  expect(() => query[Symbol.asyncIterator]()).toThrow(
    expect.objectContaining({ code: 'QUERY_ALREADY_CONSUMED' }),
  );
});

it('assimilates a query returned by an async function in array mode', async () => {
  const execute = vi.fn(async () => [1]);
  const query = new DefaultRepositoryQuery(execute, async function* () {
    yield 2;
  });
  const forward = async () => query;
  expect(await forward()).toEqual([1]);
  expect(execute).toHaveBeenCalledTimes(1);
});
