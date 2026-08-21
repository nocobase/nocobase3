import {
  defineDatabaseConfig,
  type ConfigFactory,
} from "@nocobase/app-server/config";
import type { AppDatabaseConfig } from "@nocobase/app-server/database";

const databaseConfig: ConfigFactory<AppDatabaseConfig> = defineDatabaseConfig(
  ({ env, paths }): AppDatabaseConfig => ({
    default: env.string("DB_CONNECTION", "sqlite"),

    connections: {
      sqlite: {
        dialect: "sqlite",
        filename: paths.storage(env.string("DB_DATABASE", "database.sqlite")),
        debug: env.boolean("DB_DEBUG", false),
      },

      mysql: {
        dialect: "mysql",
        host: env.string("DB_HOST", "127.0.0.1"),
        port: env.number("DB_PORT", 3306),
        database: env.string("DB_DATABASE", "app"),
        username: env.string("DB_USERNAME", "root"),
        password: env.string("DB_PASSWORD", ""),
        charset: env.string("DB_CHARSET", "utf8mb4"),
        debug: env.boolean("DB_DEBUG", false),
      },

      postgres: {
        dialect: "postgres",
        host: env.string("DB_HOST", "127.0.0.1"),
        port: env.number("DB_PORT", 5432),
        database: env.string("DB_DATABASE", "app"),
        username: env.string("DB_USERNAME", "postgres"),
        password: env.string("DB_PASSWORD", ""),
        ssl: env.boolean("DB_SSL", false),
        schema: env.list("DB_SCHEMA", ["public"]),
        debug: env.boolean("DB_DEBUG", false),
      },
    },

    migrations: {
      directory: paths.database("migrations"),
      autoRun: env.boolean("DB_MIGRATIONS_AUTO_RUN", false),
      tableName: env.string("DB_MIGRATIONS_TABLE"),
      lockTableName: env.string("DB_MIGRATIONS_LOCK_TABLE"),
    },
  }),
);

export default databaseConfig;
