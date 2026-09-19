import { expect, it } from 'vitest';
import oracle from '../src/index.js';

const Client = oracle.driver.createKnexClient?.(
  {} as never,
  undefined,
) as unknown as new () => {
  prepBindings(bindings: readonly unknown[]): unknown[];
};

it('binds space-separated datetime strings as native Oracle timestamps', () => {
  const client = new Client();
  const prepared = client.prepBindings([
    '2026-08-13 10:00:00',
    '2026-08-13 10:00:00.123',
    '2026-08-13T10:00:00.123',
    'plain',
  ]);

  expect(prepared[0]).toBeInstanceOf(Date);
  expect((prepared[0] as Date).getHours()).toBe(10);
  expect((prepared[0] as Date).getMinutes()).toBe(0);
  expect((prepared[0] as Date).getSeconds()).toBe(0);
  expect(prepared[1]).toBeInstanceOf(Date);
  expect((prepared[1] as Date).getHours()).toBe(10);
  expect((prepared[1] as Date).getMilliseconds()).toBe(123);
  expect(prepared[2]).toBe('2026-08-13T10:00:00.123');
  expect(prepared[3]).toBe('plain');
});

it('preserves non-datetime bindings', () => {
  const client = new Client();
  const date = new Date('2026-08-13T10:00:00.123Z');
  const prepared = client.prepBindings([date, 42, null, true]);

  expect(prepared[0]).toBe(date);
  expect(prepared[1]).toBe(42);
  expect(prepared[2]).toBeNull();
  expect(prepared[3]).toBe(1);
});
