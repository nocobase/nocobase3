import { createDatabaseManager } from '@nocobase/db';
import type {
  TestDatabaseEnvironment,
  TestDatabaseProvisioner,
} from '@nocobase/db/testing';
import type { Knex } from 'knex';
import { postgres, type PostgresOptions } from './index.js';

/**
 * The server a test connects to, read from the variables the dialect's
 * integration suite also uses, with the defaults of its Compose service.
 */
export function postgresTestConnection(
  env: TestDatabaseEnvironment,
): PostgresOptions {
  return {
    host: env.POSTGRES_HOST ?? env.PGHOST ?? '127.0.0.1',
    port: Number(env.POSTGRES_PORT ?? env.PGPORT ?? 15432),
    username: env.POSTGRES_USER ?? env.PGUSER ?? 'nocobase',
    password: env.POSTGRES_PASSWORD ?? env.PGPASSWORD ?? 'nocobase',
    database:
      env.POSTGRES_DATABASE ?? env.PGDATABASE ?? 'nocobase_collection_builder',
  };
}

/** Isolates each test database in its own schema of one server database. */
export const testDatabaseProvisioner: TestDatabaseProvisioner = {
  dialect: 'postgres',
  provision: async ({ name, env }) => {
    const options = postgresTestConnection(env);
    const admin = createDatabaseManager({
      connections: { main: postgres(options) },
    });
    try {
      const client = await admin.connection().client<Knex>();
      await client.raw('create schema ??', [name]);
      return {
        connection: postgres({ ...options, schema: name }),
        drop: async () => {
          try {
            await client.raw('drop schema if exists ?? cascade', [name]);
          } finally {
            await admin.destroy();
          }
        },
      };
    } catch (error) {
      await admin.destroy();
      throw error;
    }
  },
};
