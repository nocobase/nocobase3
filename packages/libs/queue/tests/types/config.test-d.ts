import { expectTypeOf, test } from 'vitest';
import type {
  QueueOptions,
  QueueBackendConnections,
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
  expectTypeOf<keyof QueueBackendConnections>().toEqualTypeOf<
    'inMemory' | 'redis'
  >();
  expectTypeOf<{ connection: Record<string, never> }>().toExtend<
    QueueOverrides<'inMemory'>
  >();
  expectTypeOf<{ connection: number }>().not.toExtend<QueueOptions<'redis'>>();
  expectTypeOf<{ connection: { host: string } }>().not.toExtend<
    QueueOptions<'inMemory'>
  >();
  expectTypeOf<QueueConnectionOptions<'custom'>>().toEqualTypeOf<unknown>();
  expectTypeOf<'connection'>().not.toExtend<keyof QueueRuntimeOptions>();
  expectTypeOf<'namespace'>().not.toExtend<keyof PublishOptions>();
});
