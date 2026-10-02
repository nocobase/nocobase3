import { createDatabaseManager, rawRows } from '@nocobase/db';
import type {
  TestDatabaseEnvironment,
  TestDatabaseProvisioner,
} from '@nocobase/db/testing';
import type { Knex } from 'knex';
import { mysql, mysqlDriver, type MysqlOptions } from './index.js';

/**
 * The server a test connects to. The defaults are those of the MySQL service
 * in the examples application's `docker-compose.yml`, which honours the same
 * `MYSQL_PORT`. Creating a database needs an account with that privilege, so
 * this reads the administrative account rather than the application user the
 * integration suite connects as.
 */
export function mysqlTestConnection(
  env: TestDatabaseEnvironment,
): MysqlOptions {
  return {
    host: env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(env.MYSQL_PORT ?? 3306),
    username: env.MYSQL_ADMIN_USER ?? 'root',
    password: env.MYSQL_ADMIN_PASSWORD ?? env.MYSQL_ROOT_PASSWORD ?? 'root',
  };
}

/** Isolates each test database in its own MySQL database. */
export const testDatabaseProvisioner: TestDatabaseProvisioner = {
  dialect: 'mysql',
  capabilities: mysqlDriver.capabilities ?? {},
  provision: async ({ name, env }) => {
    const options = mysqlTestConnection(env);
    const admin = createDatabaseManager({
      connections: { main: mysql(options) },
    });
    try {
      const client = await admin.connection().client<Knex>();
      await client.raw('create database ??', [name]);
      return {
        connection: mysql({ ...options, database: name }),
        drop: async () => {
          try {
            await client.raw('drop database if exists ??', [name]);
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
  listProvisioned: ({ prefix, env }) =>
    withAdmin(env, async (client) =>
      rawRows<{ name: string }>(
        await client.raw(
          'select schema_name as name from information_schema.schemata order by schema_name',
        ),
      )
        .map((row) => row.name)
        .filter((name) => name.startsWith(prefix)),
    ),
  dropProvisioned: ({ name, env }) =>
    withAdmin(env, async (client) => {
      await client.raw('drop database if exists ??', [name]);
    }),
};

async function withAdmin<T>(
  env: TestDatabaseEnvironment,
  run: (client: Knex) => Promise<T>,
): Promise<T> {
  const admin = createDatabaseManager({
    connections: { main: mysql(mysqlTestConnection(env)) },
  });
  try {
    return await run(await admin.connection().client<Knex>());
  } finally {
    await admin.destroy();
  }
}
