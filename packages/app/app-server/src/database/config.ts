import { Type } from '@sinclair/typebox';

import {
  defineAppConfig,
  envBoolean,
  envInteger,
  envString,
  envStrings,
  type AppConfigDefinition,
} from '../config/index.js';
import { createAppPluginDatabaseConfig } from '../plugins/index.js';
import type { ResolvedAppRuntimeConfigContext } from '../runtime/index.js';
import type { AppDatabaseConfig } from './types.js';

export const databaseConfig: AppConfigDefinition<
  AppDatabaseConfig,
  ResolvedAppRuntimeConfigContext
> = defineAppConfig({
  namespace: 'database',
  schema: Type.Object({
    default: Type.Optional(Type.String()),
    connections: Type.Unsafe<AppDatabaseConfig['connections']>(
      Type.Record(
        Type.String(),
        Type.Object(
          {
            dialect: Type.Union([
              Type.Literal('sqlite'),
              Type.Literal('postgres'),
              Type.Literal('mysql'),
            ]),
            filename: Type.Optional(Type.String()),
            host: Type.Optional(Type.String()),
            port: Type.Optional(Type.Number()),
            socketPath: Type.Optional(Type.String()),
            database: Type.Optional(Type.String()),
            username: Type.Optional(Type.String()),
            password: Type.Optional(Type.String()),
            charset: Type.Optional(Type.String()),
            timezone: Type.Optional(Type.String()),
            schema: Type.Optional(
              Type.Union([Type.String(), Type.Array(Type.String())]),
            ),
            ssl: Type.Optional(
              Type.Union([
                Type.Boolean(),
                Type.Record(Type.String(), Type.Unknown()),
              ]),
            ),
            managed: Type.Optional(Type.Boolean()),
            debug: Type.Optional(Type.Boolean()),
            driverOptions: Type.Optional(
              Type.Record(Type.String(), Type.Unknown()),
            ),
          },
          { additionalProperties: true },
        ),
      ),
    ),
    migrations: Type.Object(
      {
        directory: Type.String(),
        packageName: Type.Optional(Type.String()),
        autoRun: Type.Boolean(),
        tableName: Type.Optional(Type.String()),
        lockTableName: Type.Optional(Type.String()),
        extensions: Type.Optional(Type.Array(Type.String())),
      },
      { additionalProperties: true },
    ),
    seeds: Type.Optional(
      Type.Object(
        {
          directory: Type.String(),
          packageName: Type.Optional(Type.String()),
          autoRun: Type.Boolean(),
          tableName: Type.Optional(Type.String()),
          lockTableName: Type.Optional(Type.String()),
          extensions: Type.Optional(Type.Array(Type.String())),
        },
        { additionalProperties: true },
      ),
    ),
  }),
  defaults: ({ paths, plugins, appPackageName }) => {
    const database: AppDatabaseConfig = {
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: paths.storage('database.sqlite'),
          debug: false,
        },
      },
      migrations: {
        directory: paths.database('migrations'),
        packageName: appPackageName,
        autoRun: false,
      },
      seeds: {
        directory: paths.database('seeds'),
        packageName: appPackageName,
        autoRun: false,
      },
    };
    return createAppPluginDatabaseConfig(database, plugins).database;
  },
  envMappings: {
    DB_DIALECT: envString('connections.main.dialect'),
    DB_DATABASE: envString('connections.main.database'),
    DB_HOST: envString('connections.main.host'),
    DB_PORT: envInteger('connections.main.port'),
    DB_USERNAME: envString('connections.main.username'),
    DB_PASSWORD: envString('connections.main.password'),
    DB_CHARSET: envString('connections.main.charset'),
    DB_SSL: envBoolean('connections.main.ssl'),
    DB_SCHEMA: envStrings('connections.main.schema'),
    DB_DEBUG: envBoolean('connections.main.debug'),
    DB_MIGRATIONS_AUTO_RUN: envBoolean('migrations.autoRun'),
    DB_MIGRATIONS_TABLE: envString('migrations.tableName'),
    DB_MIGRATIONS_LOCK_TABLE: envString('migrations.lockTableName'),
    DB_SEEDS_AUTO_RUN: envBoolean('seeds.autoRun'),
    DB_SEEDS_TABLE: envString('seeds.tableName'),
    DB_SEEDS_LOCK_TABLE: envString('seeds.lockTableName'),
  },
});
