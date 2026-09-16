import { expectTypeOf, it } from 'vitest';
import type { MysqlConnectionConfig, MysqlOptions } from '../src/index.js';

it('keeps host and socket connection targets mutually exclusive', () => {
  const host: MysqlOptions = { host: 'localhost', port: 3306 };
  const socket: MysqlOptions = { socketPath: '/tmp/database.sock' };
  expectTypeOf(host).toMatchTypeOf<MysqlOptions>();
  expectTypeOf(socket).toMatchTypeOf<MysqlOptions>();
  // @ts-expect-error Factory options cannot combine host and socket targets.
  const invalidOptions: MysqlOptions = {
    host: 'localhost',
    socketPath: '/tmp/database.sock',
  };
  // @ts-expect-error Declarative connections cannot combine port and socket targets.
  const invalidConfig: MysqlConnectionConfig = {
    dialect: 'mysql',
    port: 3306,
    socketPath: '/tmp/database.sock',
  };
  expectTypeOf(invalidOptions).toMatchTypeOf<MysqlOptions>();
  expectTypeOf(invalidConfig).toMatchTypeOf<MysqlConnectionConfig>();
});
