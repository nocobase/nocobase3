import { expect, it } from 'vitest';
import {
  createDatabaseManager,
  type BaseConnectionConfig,
  type DatabaseDriverDefinition,
  type ExtensibleDatabaseConfig,
} from '@nocobase/db';

type CockroachConnection = BaseConnectionConfig & {
  dialect: 'cockroach';
  host: string;
  port: number;
};

const cockroachDriver: DatabaseDriverDefinition<'cockroach'> = {
  dialect: 'cockroach',
};

const config = {
  drivers: { cockroach: cockroachDriver },
  connections: {
    main: {
      dialect: 'cockroach' as const,
      host: 'db.example.test',
      port: 26257,
    },
  },
} satisfies ExtensibleDatabaseConfig<CockroachConnection>;

// Keep this as a compile-time contract: a new driver package can pass its own
// connection shape to the core manager without extending a core dialect union.
const manager = createDatabaseManager(config);
void manager;

it('accepts a connection shape contributed by a new dialect package', () => {
  expect(config.connections.main.dialect).toBe('cockroach');
  expect(config.connections.main.port).toBe(26257);
});
