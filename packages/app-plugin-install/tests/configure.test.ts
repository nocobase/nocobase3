import { access, readFile, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { createConfigPaths } from '@nocobase/app-server-kit/config';

import {
  configureInstallation,
  InstallConfigurationError,
  parseInstallDatabaseConfig,
} from '../server/configure.js';

const temporaryDirectories: string[] = [];
const exampleEnvironment = [
  'APP_BASE_PATH=/main',
  '# Keep this comment.',
  'DB_MIGRATIONS_AUTO_RUN=true',
  'DB_SEEDS_AUTO_RUN=true',
  'DB_DIALECT=obsolete',
  'AUTH_SECRET=obsolete',
  '',
].join('\n');

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('installation configuration', () => {
  it('creates a SQLite environment from the example', async () => {
    const rootDir = await createTemporaryRoot();

    await expect(
      configureInstallation(
        { dialect: 'sqlite', database: 'storage/app.sqlite', debug: true },
        {
          paths: createConfigPaths({ rootDir }),
          generateSecret: () => 'test-secret',
        },
      ),
    ).resolves.toEqual({ configured: true, restartRequired: true });

    const environment = await readFile(path.join(rootDir, '.env'), 'utf8');
    expect(environment).toContain('APP_BASE_PATH=/main');
    expect(environment).toContain('# Keep this comment.');
    expect(environment).toContain('DB_MIGRATIONS_AUTO_RUN=true');
    expect(environment).toContain('DB_SEEDS_AUTO_RUN=true');
    expect(environment).toContain('DB_DIALECT=sqlite');
    expect(environment).toContain('DB_DATABASE=storage/app.sqlite');
    expect(environment).toContain('DB_DEBUG=true');
    expect(environment).toContain('AUTH_SECRET=test-secret');
    expect(environment).not.toContain('DB_DIALECT=obsolete');
    expect(environment).not.toContain('AUTH_SECRET=obsolete');
    expect(environment).not.toContain('DB_HOST=');
  });

  it('creates a PostgreSQL environment with escaped values', async () => {
    const rootDir = await createTemporaryRoot();

    await configureInstallation(
      {
        dialect: 'postgres',
        host: 'database.internal',
        port: 5432,
        database: 'nocobase',
        username: 'app',
        password: 'space and # symbol',
        schema: 'public,tenant',
        ssl: true,
        debug: false,
      },
      {
        paths: createConfigPaths({ rootDir }),
        generateSecret: () => 'postgres-secret',
      },
    );

    const environment = await readFile(path.join(rootDir, '.env'), 'utf8');
    expect(environment).toContain('DB_DIALECT=postgres');
    expect(environment).toContain('DB_HOST=database.internal');
    expect(environment).toContain('DB_PORT=5432');
    expect(environment).toContain('DB_DATABASE=nocobase');
    expect(environment).toContain('DB_USERNAME=app');
    expect(environment).toContain('DB_PASSWORD="space and # symbol"');
    expect(environment).toContain('DB_SSL=true');
    expect(environment).toContain('DB_SCHEMA=public,tenant');
    expect(environment).not.toContain('DB_CHARSET=');
  });

  it('creates a MySQL environment without PostgreSQL-only values', async () => {
    const rootDir = await createTemporaryRoot();

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
        generateSecret: () => 'mysql-secret',
      },
    );

    const environment = await readFile(path.join(rootDir, '.env'), 'utf8');
    expect(environment).toContain('DB_DIALECT=mysql');
    expect(environment).toContain('DB_PORT=3306');
    expect(environment).toContain('DB_PASSWORD=\n');
    expect(environment).toContain('DB_CHARSET=utf8mb4');
    expect(environment).not.toContain('DB_SSL=');
    expect(environment).not.toContain('DB_SCHEMA=');
  });

  it('generates a strong authentication secret by default', async () => {
    const rootDir = await createTemporaryRoot();

    await configureInstallation(
      { dialect: 'sqlite', database: 'database.sqlite' },
      { paths: createConfigPaths({ rootDir }) },
    );

    const environment = await readFile(path.join(rootDir, '.env'), 'utf8');
    const secret = /^AUTH_SECRET=(.+)$/mu.exec(environment)?.[1];
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/u);
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
        database: 'database.sqlite\nAUTH_SECRET=unsafe',
      }),
    ).toThrow('must not contain line breaks or null bytes');
  });

  it('never overwrites an existing environment file', async () => {
    const rootDir = await createTemporaryRoot();
    const environmentPath = path.join(rootDir, '.env');
    await writeFile(environmentPath, 'ORIGINAL=true\n', 'utf8');

    await expect(
      configureInstallation(
        { dialect: 'sqlite', database: 'database.sqlite' },
        { paths: createConfigPaths({ rootDir }) },
      ),
    ).rejects.toMatchObject<Partial<InstallConfigurationError>>({
      status: 409,
    });
    await expect(readFile(environmentPath, 'utf8')).resolves.toBe(
      'ORIGINAL=true\n',
    );
  });

  it('allows only one concurrent configuration write', async () => {
    const rootDir = await createTemporaryRoot();
    const results = await Promise.allSettled([
      configureInstallation(
        { dialect: 'sqlite', database: 'first.sqlite' },
        {
          paths: createConfigPaths({ rootDir }),
          generateSecret: () => 'first-secret',
        },
      ),
      configureInstallation(
        { dialect: 'sqlite', database: 'second.sqlite' },
        {
          paths: createConfigPaths({ rootDir }),
          generateSecret: () => 'second-secret',
        },
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { status: 409 } });
    await expect(access(path.join(rootDir, '.env'))).resolves.toBeUndefined();
  });
});

async function createTemporaryRoot(): Promise<string> {
  const directory = mkdtempSync(
    path.join(tmpdir(), 'nocobase-app-plugin-install-configure-'),
  );
  temporaryDirectories.push(directory);
  await writeFile(
    path.join(directory, '.env.example'),
    exampleEnvironment,
    'utf8',
  );
  return directory;
}
