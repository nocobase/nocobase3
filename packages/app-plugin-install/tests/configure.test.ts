import { mkdtempSync, rmSync } from 'node:fs';
import { access, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createConfigPaths } from '@nocobase/app-server-kit/config';
import { afterEach, describe, expect, it } from 'vitest';

import {
  configureInstallation,
  InstallConfigurationError,
  parseInstallDatabaseConfig,
} from '../server/configure.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('installation configuration', () => {
  it('creates a SQLite config file', async () => {
    const rootDir = createTemporaryRoot();
    await expect(
      configureInstallation(
        { dialect: 'sqlite', database: 'storage/app.sqlite', debug: true },
        {
          paths: createConfigPaths({ rootDir }),
          generateSecret: () => 'test-secret',
        },
      ),
    ).resolves.toEqual({ configured: true, restartRequired: true });

    const config = await readFile(path.join(rootDir, 'config.yml'), 'utf8');
    expect(config).toContain('secret: "test-secret"');
    expect(config).toContain('dialect: sqlite');
    expect(config).toContain('database: "storage/app.sqlite"');
    expect(config).toContain('debug: true');
    expect(config).not.toContain('host:');
  });

  it('creates a PostgreSQL config file', async () => {
    const rootDir = createTemporaryRoot();
    await configureInstallation(
      {
        dialect: 'postgres',
        host: 'database.internal',
        port: 5432,
        database: 'nocobase',
        username: 'app',
        password: 'space and # symbol',
        schema: 'public',
        ssl: true,
      },
      {
        paths: createConfigPaths({ rootDir }),
        generateSecret: () => 'secret',
      },
    );

    const config = await readFile(path.join(rootDir, 'config.yml'), 'utf8');
    expect(config).toContain('dialect: postgres');
    expect(config).toContain('password: "space and # symbol"');
    expect(config).toContain('schema: ["public"]');
    expect(config).toContain('ssl: true');
    expect(config).not.toContain('charset:');
  });

  it('creates a MySQL config file', async () => {
    const rootDir = createTemporaryRoot();
    await configureInstallation(
      {
        dialect: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        database: 'app',
        username: 'root',
        password: '',
        charset: 'utf8mb4',
      },
      {
        paths: createConfigPaths({ rootDir }),
        generateSecret: () => 'secret',
      },
    );

    const config = await readFile(path.join(rootDir, 'config.yml'), 'utf8');
    expect(config).toContain('password: ""');
    expect(config).toContain('charset: "utf8mb4"');
    expect(config).not.toContain('schema:');
  });

  it('generates a strong authentication secret by default', async () => {
    const rootDir = createTemporaryRoot();
    await configureInstallation(
      { dialect: 'sqlite', database: 'database.sqlite' },
      { paths: createConfigPaths({ rootDir }) },
    );
    const config = await readFile(path.join(rootDir, 'config.yml'), 'utf8');
    expect(/secret: "([A-Za-z0-9_-]{43})"/u.exec(config)?.[1]).toBeTruthy();
  });

  it('validates dialect-specific values', () => {
    expect(() => parseInstallDatabaseConfig({ dialect: 'oracle' })).toThrow(
      'Database dialect must be "sqlite", "postgres", or "mysql".',
    );
    expect(() =>
      parseInstallDatabaseConfig({
        dialect: 'postgres',
        database: 'app',
        host: 'localhost',
        port: 0,
        username: 'postgres',
        schema: 'public',
      }),
    ).toThrow('Database port must be an integer from 1 to 65535.');
    expect(() =>
      parseInstallDatabaseConfig({
        dialect: 'sqlite',
        database: 'database.sqlite\nunsafe',
      }),
    ).toThrow('must not contain line breaks or null bytes');
  });

  it('never overwrites an existing config file', async () => {
    const rootDir = createTemporaryRoot();
    const configPath = path.join(rootDir, 'config.yml');
    await writeFile(configPath, 'original: true\n', 'utf8');
    await expect(
      configureInstallation(
        { dialect: 'sqlite', database: 'database.sqlite' },
        { paths: createConfigPaths({ rootDir }) },
      ),
    ).rejects.toMatchObject<Partial<InstallConfigurationError>>({
      status: 409,
    });
    await expect(readFile(configPath, 'utf8')).resolves.toBe(
      'original: true\n',
    );
  });

  it('allows only one concurrent configuration write', async () => {
    const rootDir = createTemporaryRoot();
    const options = { paths: createConfigPaths({ rootDir }) };
    const results = await Promise.allSettled([
      configureInstallation(
        { dialect: 'sqlite', database: 'first.sqlite' },
        options,
      ),
      configureInstallation(
        { dialect: 'sqlite', database: 'second.sqlite' },
        options,
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { status: 409 } });
    await expect(
      access(path.join(rootDir, 'config.yml')),
    ).resolves.toBeUndefined();
  });
});

function createTemporaryRoot(): string {
  const directory = mkdtempSync(
    path.join(tmpdir(), 'nocobase-install-config-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}
