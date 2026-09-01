import { describe, expect, it } from 'vitest';

import { buildConfigFile } from '../src/lib/config-file.ts';

describe('buildConfigFile', () => {
  it('builds a SQLite application config', () => {
    const config = buildConfigFile({
      secret: 'test-secret',
      database: {
        dialect: 'sqlite',
        database: 'storage/app.sqlite',
        debug: false,
      },
    });

    expect(config.match(/secret: "test-secret"/gu)).toHaveLength(2);
    expect(config).toContain('session:\n  secret: "test-secret"');
    expect(config).toContain('dialect: sqlite');
    expect(config).toContain('database: "storage/app.sqlite"');
    expect(config).not.toContain('host:');
  });

  it('builds PostgreSQL-specific config', () => {
    const config = buildConfigFile({
      secret: 'test-secret',
      database: {
        dialect: 'postgres',
        host: 'localhost',
        port: 5432,
        database: 'nocobase',
        username: 'postgres',
        password: 'password',
        schema: 'public',
        ssl: false,
        debug: false,
      },
    });

    expect(config).toContain('schema: ["public"]');
    expect(config).toContain('ssl: false');
    expect(config).not.toContain('charset:');
  });

  it('builds Oracle-specific config without a database field', () => {
    const config = buildConfigFile({
      secret: 'test-secret',
      database: {
        dialect: 'oracle',
        host: 'localhost',
        port: 1521,
        serviceName: 'FREEPDB1',
        username: 'nocobase',
        password: 'password',
      },
    });

    expect(config).toContain('dialect: oracle');
    expect(config).toContain('serviceName: "FREEPDB1"');
    expect(config).not.toMatch(/^\s{6}database:/mu);
  });

  it('builds MSSQL-specific TLS config', () => {
    const config = buildConfigFile({
      secret: 'test-secret',
      database: {
        dialect: 'mssql',
        host: 'localhost',
        port: 1433,
        database: 'nocobase',
        username: 'sa',
        password: 'password',
        encrypt: false,
        trustServerCertificate: true,
      },
    });

    expect(config).toContain('dialect: mssql');
    expect(config).toContain('database: "nocobase"');
    expect(config).toContain('encrypt: false');
    expect(config).toContain('trustServerCertificate: true');
  });
});
