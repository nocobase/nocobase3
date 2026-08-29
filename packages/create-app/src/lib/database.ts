/**
 * The three dialects the app template's `server/config/database.ts` understands. The values are exactly what
 * `DB_DIALECT` accepts — `postgres`, not `postgresql`, and `sqlite`, not `sqlite3` — because that file throws on
 * anything else. User-facing aliases are resolved separately by `parseDialect`.
 */
export type DatabaseDialect = 'sqlite' | 'postgres' | 'mysql';

export const DATABASE_DIALECTS: readonly DatabaseDialect[] = [
  'postgres',
  'sqlite',
  'mysql',
];

/**
 * The driver each dialect needs at runtime. The template ships none of them — it depends on `knex` alone — so exactly
 * one of these is installed into the generated project after the dialect is known.
 */
export const DIALECT_DRIVERS: Readonly<Record<DatabaseDialect, string>> = {
  sqlite: 'better-sqlite3',
  postgres: 'pg',
  mysql: 'mysql2',
};

/**
 * Only `better-sqlite3` compiles a native addon, so it is the only driver whose install script has to be allowed. The
 * other two are pure JavaScript and install with no build step at all.
 */
export const DRIVERS_NEEDING_BUILD: readonly string[] = ['better-sqlite3'];

export interface DialectChoice {
  value: DatabaseDialect;
  label: string;
  hint: string;
}

export const DIALECT_CHOICES: readonly DialectChoice[] = [
  {
    value: 'postgres',
    label: 'PostgreSQL',
    hint: 'installs pg',
  },
  {
    value: 'sqlite',
    label: 'SQLite',
    hint: 'installs better-sqlite3, no server needed',
  },
  {
    value: 'mysql',
    label: 'MySQL',
    hint: 'installs mysql2',
  },
];

/**
 * Accepts both the canonical dialect names and the spellings people reach for on the command line. `postgresql` and
 * `pg` are common ways to say `postgres`, and `sqlite3` is how the driver rather than the dialect is usually named;
 * rejecting them would be needlessly strict when the intent is unambiguous.
 */
const DIALECT_ALIASES: Readonly<Record<string, DatabaseDialect>> = {
  postgres: 'postgres',
  postgresql: 'postgres',
  pg: 'postgres',
  sqlite: 'sqlite',
  sqlite3: 'sqlite',
  'better-sqlite3': 'sqlite',
  mysql: 'mysql',
  mysql2: 'mysql',
  mariadb: 'mysql',
};

export function parseDialect(value: string): DatabaseDialect {
  const normalized = value.trim().toLowerCase();
  const dialect = DIALECT_ALIASES[normalized];

  if (!dialect) {
    throw new Error(
      `Unknown database type "${value}". Expected one of: ${Object.keys(DIALECT_ALIASES).join(', ')}.`,
    );
  }

  return dialect;
}

export function isDatabaseDialect(value: string): value is DatabaseDialect {
  return (DATABASE_DIALECTS as readonly string[]).includes(value);
}

export interface SqliteDatabaseConfig {
  dialect: 'sqlite';
  /** File name inside the app's storage directory, not a path the user has to resolve. */
  database: string;
}

export interface PostgresDatabaseConfig {
  dialect: 'postgres';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  schema: string;
  ssl: boolean;
}

export interface MysqlDatabaseConfig {
  dialect: 'mysql';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  charset: string;
}

export type DatabaseConfig =
  SqliteDatabaseConfig | PostgresDatabaseConfig | MysqlDatabaseConfig;

export const SQLITE_DEFAULT_DATABASE = 'database.sqlite';
export const POSTGRES_DEFAULT_SCHEMA = 'public';
export const MYSQL_DEFAULT_CHARSET = 'utf8mb4';

/**
 * The connection settings written into `config.yml` for a dialect.
 *
 * Only the dialect is ever asked for, so everything else takes the same default the template's own
 * `server/config/database.ts` falls back to. That makes SQLite runnable immediately, and leaves the server-backed
 * dialects with a complete, correctly-shaped block whose host and credentials the user edits before starting the app.
 */
export function defaultDatabaseConfig(
  dialect: DatabaseDialect,
): DatabaseConfig {
  if (dialect === 'sqlite') {
    return { dialect, database: SQLITE_DEFAULT_DATABASE };
  }

  if (dialect === 'mysql') {
    return {
      dialect,
      host: '127.0.0.1',
      port: 3306,
      database: 'app',
      username: 'root',
      password: '',
      charset: MYSQL_DEFAULT_CHARSET,
    };
  }

  return {
    dialect,
    host: '127.0.0.1',
    port: 5432,
    database: 'app',
    username: 'postgres',
    password: '',
    schema: POSTGRES_DEFAULT_SCHEMA,
    ssl: false,
  };
}

export function driverFor(dialect: DatabaseDialect): string {
  return DIALECT_DRIVERS[dialect];
}

export function driverNeedsBuild(driver: string): boolean {
  return DRIVERS_NEEDING_BUILD.includes(driver);
}

/** Whether the dialect needs connection details the generated `config.yml` cannot fill in correctly on its own. */
export function needsConnectionDetails(dialect: DatabaseDialect): boolean {
  return dialect !== 'sqlite';
}
