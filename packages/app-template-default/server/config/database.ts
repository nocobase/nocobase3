import {
  defineDatabaseConfig,
  type ConfigEnv,
  type ConfigPaths,
} from '@nocobase/app-server-kit/config';
import type { ConnectionConfig, DatabaseDialect } from '@nocobase/app-database';
import type { AppDatabaseConfig } from '@nocobase/app-server-kit/database';
import type { AppRuntimeConfigFactory } from '@nocobase/app-server-kit/runtime';
import { createAppPluginDatabaseConfig } from '@nocobase/app-server-kit/plugins';
import type {
  AppConfig,
  DefaultAppConfigContext,
  DefaultAppScopeConfig,
} from './types.js';

const databaseConfig: AppRuntimeConfigFactory<
  AppDatabaseConfig,
  AppConfig,
  DefaultAppScopeConfig
> = defineDatabaseConfig<AppDatabaseConfig, DefaultAppConfigContext>(
  ({ env, paths, plugins }): AppDatabaseConfig => {
    const database: AppDatabaseConfig = {
      default: 'main',

      connections: {
        main: createMainConnectionConfig(env, paths),
      },

      migrations: {
        directory: paths.database('migrations'),
        packageName: '@nocobase/app-template-default',
        autoRun: env.boolean('DB_MIGRATIONS_AUTO_RUN', false),
        tableName: env.string('DB_MIGRATIONS_TABLE'),
        lockTableName: env.string('DB_MIGRATIONS_LOCK_TABLE'),
      },

      seeds: {
        directory: paths.database('seeds'),
        packageName: '@nocobase/app-template-default',
        autoRun: env.boolean('DB_SEEDS_AUTO_RUN', false),
        tableName: env.string('DB_SEEDS_TABLE'),
        lockTableName: env.string('DB_SEEDS_LOCK_TABLE'),
      },
    };

    return plugins
      ? createAppPluginDatabaseConfig(database, plugins).database
      : database;
  },
);

export default databaseConfig;

function createMainConnectionConfig(
  env: ConfigEnv,
  paths: ConfigPaths,
): ConnectionConfig {
  const dialect = resolveDatabaseDialect(env.string('DB_DIALECT', 'sqlite'));
  const debug = env.boolean('DB_DEBUG', false);

  switch (dialect) {
    case 'sqlite':
      return {
        dialect,
        filename: paths.storage(env.string('DB_DATABASE', 'database.sqlite')),
        debug,
      };
    case 'mysql':
      return {
        dialect,
        host: env.string('DB_HOST', '127.0.0.1'),
        port: env.number('DB_PORT', 3306),
        database: env.string('DB_DATABASE', 'app'),
        username: env.string('DB_USERNAME', 'root'),
        password: env.string('DB_PASSWORD', ''),
        charset: env.string('DB_CHARSET', 'utf8mb4'),
        debug,
      };
    case 'postgres':
      return {
        dialect,
        host: env.string('DB_HOST', '127.0.0.1'),
        port: env.number('DB_PORT', 5432),
        database: env.string('DB_DATABASE', 'app'),
        username: env.string('DB_USERNAME', 'postgres'),
        password: env.string('DB_PASSWORD', ''),
        ssl: env.boolean('DB_SSL', false),
        schema: env.list('DB_SCHEMA', ['public']),
        debug,
      };
  }
}

function resolveDatabaseDialect(value: string): DatabaseDialect {
  if (value === 'sqlite' || value === 'mysql' || value === 'postgres') {
    return value;
  }

  throw new Error(
    `Invalid DB_DIALECT "${value}". Expected "sqlite", "postgres", or "mysql".`,
  );
}
