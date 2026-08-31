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
});
