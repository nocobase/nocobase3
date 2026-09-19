import * as fs from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { spoolRows } from '../../../src/repository/internal/row-spool.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, mkdtemp: vi.fn(original.mkdtemp) };
});

it.each([false, true])(
  'preserves driver value types and ordering (reverse=%s)',
  async (reverse) => {
    const rows = [
      {
        code: 'A',
        date: new Date('2026-01-01Z'),
        large: 9007199254740993n,
        bytes: Buffer.from([0, 255]),
        nested: { value: null },
      },
      {
        code: 'B',
        date: new Date('2026-02-01Z'),
        large: 1n,
        bytes: Buffer.from([2]),
        nested: { value: null },
      },
    ];
    const source = async function* () {
      yield* rows;
    };
    const result = [];
    for await (const row of spoolRows(source(), reverse)) result.push(row);
    expect(result).toEqual(reverse ? [...rows].reverse() : rows);
  },
);

it.each([
  'complete',
  'break',
  'producer-error',
  'consumer-error',
  'empty',
] as const)('removes only its private directory after %s', async (mode) => {
  const original = (
    await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  ).mkdtemp;
  const directories: string[] = [];
  const spy = vi.mocked(fs.mkdtemp).mockImplementation(async (...args) => {
    const directory = await original(...args);
    if (typeof directory === 'string') directories.push(directory);
    return directory;
  });
  const failure = new Error('controlled failure');
  async function* source() {
    if (mode === 'empty') return;
    yield { code: 'A' };
    if (mode === 'producer-error') throw failure;
    yield { code: 'B' };
  }
  const consume = async () => {
    for await (const _row of spoolRows(source(), false)) {
      if (mode === 'break') break;
      if (mode === 'consumer-error') throw failure;
    }
  };
  try {
    if (mode.endsWith('error')) await expect(consume()).rejects.toBe(failure);
    else await consume();
    expect(directories).toHaveLength(1);
    await expect(fs.stat(directories[0]!)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  } finally {
    spy.mockImplementation(original);
  }
});
