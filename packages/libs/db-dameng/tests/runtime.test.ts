import { expect, it } from 'vitest';
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
