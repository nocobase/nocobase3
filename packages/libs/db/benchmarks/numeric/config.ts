import type { ConnectionConfig, DatabaseDialect } from '../../src/index.js';

export const dialects: DatabaseDialect[] = [
  'sqlite',
  'postgres',
  'mysql',
  'oracle',
  'mssql',
];

/** Defaults match the package's dedicated integration Docker services. */
export function connectionConfig(dialect: DatabaseDialect): ConnectionConfig {
  const env = process.env;
  const host = (prefix: string) => env[`${prefix}_HOST`] ?? '127.0.0.1';
  const port = (prefix: string, fallback: number) =>
    Number(env[`${prefix}_PORT`] ?? fallback);
  const user = (prefix: string) => env[`${prefix}_USER`] ?? 'nocobase';
  const password = (prefix: string) => env[`${prefix}_PASSWORD`] ?? 'nocobase';
  const database = (prefix: string) =>
    env[`${prefix}_DATABASE`] ?? 'nocobase_collection_builder';
  switch (dialect) {
    case 'sqlite':
      return { dialect, filename: ':memory:' };
    case 'postgres':
      return {
        dialect,
        host: host('POSTGRES'),
        port: port('POSTGRES', 15432),
        username: user('POSTGRES'),
        password: password('POSTGRES'),
        database: database('POSTGRES'),
      };
    case 'mysql':
      return {
        dialect,
        host: host('MYSQL'),
        port: port('MYSQL', 13306),
        username: user('MYSQL'),
        password: password('MYSQL'),
        database: database('MYSQL'),
      };
    case 'oracle':
      return {
        dialect,
        host: host('ORACLE'),
        port: port('ORACLE', 11521),
        username: user('ORACLE'),
        password: password('ORACLE'),
        serviceName: env.ORACLE_SERVICE_NAME ?? 'FREEPDB1',
      };
    case 'mssql':
      return {
        dialect,
        host: host('MSSQL'),
        port: port('MSSQL', 11433),
        username: env.MSSQL_USER ?? 'sa',
        password: env.MSSQL_PASSWORD ?? 'NocoBase_Mssql_2026',
        database: database('MSSQL'),
        encrypt: false,
        trustServerCertificate: true,
      };
  }
}
