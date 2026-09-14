import { expect, it, vi } from 'vitest';
import dameng from '../src/index.js';

it('provides DM runtime strategies', () => {
  const runtime = dameng.driver.createRuntime?.({
    dialect: 'dameng',
    capabilities: {},
    config: {},
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
    config: {},
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
    config: {},
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

it('follows the connection when the driver is asked to parse JSON', () => {
  const form = (connection: unknown): unknown =>
    dameng.driver.createRuntime?.({
      dialect: 'dameng',
      capabilities: {},
      config: { connection },
    } as never)?.repository?.jsonResults;

  // A clob hands back the stored text unless the driver decodes it, and the
  // decoder must not parse an already-decoded value a second time.
  expect(form({})).toBe('text');
  expect(form({ parseJson: false })).toBe('text');
  expect(form({ parseJson: true })).toBe('parsed');
});
