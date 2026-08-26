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
  });

  it('ignores surrounding whitespace and case', () => {
    expect(parseDialect('  PostgreSQL  ')).toBe('postgres');
    expect(parseDialect('SQLite3')).toBe('sqlite');
  });

  it('rejects anything else, listing what is accepted', () => {
    expect(() => parseDialect('oracle')).toThrow(/Unknown database type/u);
    expect(() => parseDialect('oracle')).toThrow(/postgres/u);
  });
});

describe('driverFor', () => {
  it('maps each dialect to the driver its runtime needs', () => {
    expect(driverFor('sqlite')).toBe('better-sqlite3');
    expect(driverFor('postgres')).toBe('pg');
    expect(driverFor('mysql')).toBe('mysql2');
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
  it('is true only for the driver that compiles a native addon', () => {
    expect(driverNeedsBuild('better-sqlite3')).toBe(true);
    expect(driverNeedsBuild('pg')).toBe(false);
    expect(driverNeedsBuild('mysql2')).toBe(false);
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
});

describe('needsConnectionDetails', () => {
  it('is false only for sqlite, which runs with no server', () => {
    expect(needsConnectionDetails('sqlite')).toBe(false);
    expect(needsConnectionDetails('postgres')).toBe(true);
    expect(needsConnectionDetails('mysql')).toBe(true);
  });
});
