import { describe, expect, it } from 'vitest';
import {
  DATABASE_DIALECTS,
  defaultDatabaseConfig,
  driverFor,
  driverNeedsBuild,
  needsConnectionDetails,
  parseDialect,
} from '../src/lib/database.ts';

describe('parseDialect', () => {
  it('accepts the canonical names', () => {
    expect(parseDialect('postgres')).toBe('postgres');
    expect(parseDialect('sqlite')).toBe('sqlite');
    expect(parseDialect('mysql')).toBe('mysql');
    expect(parseDialect('oracle')).toBe('oracle');
  });

  /**
   * The names people reach for on the command line are not the names `DB_DIALECT` accepts. Rejecting them would be
   * needlessly strict when the intent is unambiguous.
   */
  it('accepts the spellings users actually type', () => {
    expect(parseDialect('postgresql')).toBe('postgres');
    expect(parseDialect('pg')).toBe('postgres');
    expect(parseDialect('sqlite3')).toBe('sqlite');
    expect(parseDialect('mysql2')).toBe('mysql');
    expect(parseDialect('mariadb')).toBe('mysql');
    expect(parseDialect('oracledb')).toBe('oracle');
  });

  it('ignores surrounding whitespace and case', () => {
    expect(parseDialect('  PostgreSQL  ')).toBe('postgres');
    expect(parseDialect('SQLite3')).toBe('sqlite');
  });

  it('rejects anything else, listing what is accepted', () => {
    expect(() => parseDialect('sqlserver')).toThrow(/Unknown database type/u);
    expect(() => parseDialect('sqlserver')).toThrow(/postgres/u);
  });
});

describe('driverFor', () => {
  it('maps each dialect to the driver its runtime needs', () => {
    expect(driverFor('sqlite')).toBe('better-sqlite3');
    expect(driverFor('postgres')).toBe('pg');
    expect(driverFor('mysql')).toBe('mysql2');
    expect(driverFor('oracle')).toBe('oracledb');
  });

  it('covers every dialect', () => {
    for (const dialect of DATABASE_DIALECTS) {
      expect(driverFor(dialect)).toBeTruthy();
    }
  });
});

describe('driverNeedsBuild', () => {
  /**
   * This drives whether an `allowBuilds` entry is written. Marking a pure-JavaScript driver as needing a build would
   * put a pointless entry in the generated project; missing a native one leaves it unusable at runtime.
   */
  it('identifies drivers whose install scripts pnpm must allow', () => {
    expect(driverNeedsBuild('better-sqlite3')).toBe(true);
    expect(driverNeedsBuild('pg')).toBe(false);
    expect(driverNeedsBuild('mysql2')).toBe(false);
    expect(driverNeedsBuild('oracledb')).toBe(true);
  });
});

describe('defaultDatabaseConfig', () => {
  it('gives sqlite a file name and nothing else', () => {
    expect(defaultDatabaseConfig('sqlite')).toEqual({
      dialect: 'sqlite',
      database: 'database.sqlite',
    });
  });

  it('matches the template defaults for postgres', () => {
    expect(defaultDatabaseConfig('postgres')).toEqual({
      dialect: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      database: 'app',
      username: 'postgres',
      password: '',
      schema: 'public',
      ssl: false,
    });
  });

  it('matches the template defaults for mysql', () => {
    expect(defaultDatabaseConfig('mysql')).toEqual({
      dialect: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      database: 'app',
      username: 'root',
      password: '',
      charset: 'utf8mb4',
    });
  });

  it('provides an Oracle Thin mode connection', () => {
    expect(defaultDatabaseConfig('oracle')).toEqual({
      dialect: 'oracle',
      host: '127.0.0.1',
      port: 1521,
      serviceName: 'FREEPDB1',
      username: 'nocobase',
      password: '',
    });
  });
});

describe('needsConnectionDetails', () => {
  it('is false only for sqlite, which runs with no server', () => {
    expect(needsConnectionDetails('sqlite')).toBe(false);
    expect(needsConnectionDetails('postgres')).toBe(true);
    expect(needsConnectionDetails('mysql')).toBe(true);
    expect(needsConnectionDetails('oracle')).toBe(true);
  });
});
