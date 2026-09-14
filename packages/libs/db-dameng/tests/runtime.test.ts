import { expect, it, vi } from 'vitest';
import dameng from '../src/index.js';

it('provides DM runtime strategies', () => {
  const runtime = dameng.driver.createRuntime?.({
    dialect: 'dameng',
    capabilities: {},
  } as never);
  expect(runtime?.dialect).toBe('dameng');
  expect(
    runtime?.schema?.columnType?.({ column: { type: 'datetime' } } as never),
  ).toBe('timestamp(3)');
  expect(
    runtime?.repository?.encodeBoolean?.({ type: 'boolean' } as never, true),
  ).toBe(1);
});

it('decodes returned LOB values and closes them after reading', async () => {
  const runtime = dameng.driver.createRuntime?.({
    dialect: 'dameng',
    capabilities: {},
  } as never);
  const close = vi.fn().mockResolvedValue(undefined);
  const row = {
    title: {
      getData: vi.fn().mockResolvedValue('hello'),
      close,
    },
  };

  await runtime?.repository?.decodeReturnedRow?.(row);

  expect(row).toEqual({ title: 'hello' });
  expect(close).toHaveBeenCalledOnce();
});

it('closes a returned LOB when reading it fails', async () => {
  const runtime = dameng.driver.createRuntime?.({
    dialect: 'dameng',
    capabilities: {},
  } as never);
  const close = vi.fn().mockResolvedValue(undefined);
  const error = new Error('LOB read failed');
  const row = {
    body: {
      getData: vi.fn().mockRejectedValue(error),
      close,
    },
  };

  await expect(runtime?.repository?.decodeReturnedRow?.(row)).rejects.toBe(
    error,
  );
  expect(close).toHaveBeenCalledOnce();
});
