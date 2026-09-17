import { expectTypeOf, test } from 'vitest';
import type {
  QueueOptions,
  QueueOverrides,
  QueueConnectionOptions,
  QueueRuntimeOptions,
  PublishOptions,
} from '../../src/types.js';

test('built-in connection generics preserve valid inputs and reject invalid ones', () => {
  expectTypeOf<{
    queueBackend: 'redis';
    connection: { host: string; port: number };
  }>().toExtend<QueueOptions<'redis'>>();
  expectTypeOf<{ queueBackend: 'postgres'; connection: string }>().toExtend<
    QueueOptions<'postgres'>
  >();
  expectTypeOf<{ connection: Record<string, never> }>().toExtend<
    QueueOverrides<'inMemory'>
  >();
  expectTypeOf<{ connection: number }>().not.toExtend<QueueOptions<'redis'>>();
  expectTypeOf<{ connection: number }>().not.toExtend<
    QueueOptions<'postgres'>
  >();
  expectTypeOf<{ connection: { host: string } }>().not.toExtend<
    QueueOptions<'inMemory'>
  >();
  expectTypeOf<QueueConnectionOptions<'custom'>>().toEqualTypeOf<unknown>();
  expectTypeOf<'connection'>().not.toExtend<keyof QueueRuntimeOptions>();
  expectTypeOf<'namespace'>().not.toExtend<keyof PublishOptions>();
});
