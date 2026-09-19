import { expectTypeOf, it } from 'vitest';
import type {
  OceanbaseConnectionConfig,
  OceanbaseOptions,
} from '../src/index.js';

it('keeps host and socket connection targets mutually exclusive', () => {
  const host: OceanbaseOptions = { host: 'localhost', port: 3306 };
  const socket: OceanbaseOptions = { socketPath: '/tmp/database.sock' };
  expectTypeOf(host).toMatchTypeOf<OceanbaseOptions>();
  expectTypeOf(socket).toMatchTypeOf<OceanbaseOptions>();
  // @ts-expect-error Factory options cannot combine host and socket targets.
  const invalidOptions: OceanbaseOptions = {
    host: 'localhost',
    socketPath: '/tmp/database.sock',
  };
  // @ts-expect-error Declarative connections cannot combine port and socket targets.
  const invalidConfig: OceanbaseConnectionConfig = {
    dialect: 'oceanbase',
    port: 3306,
    socketPath: '/tmp/database.sock',
  };
  expectTypeOf(invalidOptions).toMatchTypeOf<OceanbaseOptions>();
  expectTypeOf(invalidConfig).toMatchTypeOf<OceanbaseConnectionConfig>();
});
