import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  ConfigInitError,
  findAvailableDialects,
  runConfigInit,
} from '../src/lib/config-init.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    await rm(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

const EXAMPLE = [
  '# Copy this file to config.yml before starting the application.',
  'client:',
  '  app:',
  '    title: NocoBase',
  'auth:',
  '  # Generate a unique secret.',
  '  secret: replace-with-a-unique-secret',
  'session:',
  '  secret: replace-with-a-unique-secret',
  'database:',
  '  default: main',
  '  connections:',
  '    main:',
  '      dialect: sqlite',
  '      database: database.sqlite',
  '      schemaManagement: managed',
  '      migrations:',
  '        autoRun: true',
  '    analytics:',
  '      dialect: sqlite',
  '      database: analytics.sqlite',
  '',
].join('\n');

/**
 * Builds a directory that looks enough like an application for the command: the runtime module whose extension tells
 * source from deployment, the example the file is generated from, and a `node_modules` holding the drivers named.
 */
async function createApplication(options: {
  readonly mode?: 'source' | 'deployment';
  readonly drivers?: readonly string[];
  readonly example?: string | null;
}): Promise<{ readonly rootDir: string; readonly deploymentRootDir: string }> {
  const base = await mkdtemp(path.join(os.tmpdir(), 'nocobase-config-init-'));
  temporaryDirectories.push(base);
  const mode = options.mode ?? 'source';
  // A deployment runs out of `dist`, with its configuration and example one level up beside it.
  const rootDir = mode === 'source' ? base : path.join(base, 'dist');
  const deploymentRootDir = base;

  await mkdir(path.join(rootDir, 'server'), { recursive: true });
  await writeFile(
    path.join(
      rootDir,
      'server',
      mode === 'source' ? 'runtime.ts' : 'runtime.js',
    ),
    'export default {};\n',
  );

  if (options.example !== null) {
    await writeFile(
      path.join(deploymentRootDir, 'config.example.yml'),
      options.example ?? EXAMPLE,
    );
  }

  const drivers = options.drivers ?? [];
  if (mode === 'deployment') {
    await writeFile(
      path.join(rootDir, 'package.json'),
      `${JSON.stringify({
        name: 'app',
        dependencies: Object.fromEntries(
          drivers.map((dialect) => [`@nocobase/db-${dialect}`, '1.0.0']),
        ),
      })}\n`,
    );
  }

  for (const dialect of drivers) {
    await mkdir(
      path.join(rootDir, 'node_modules', '@nocobase', `db-${dialect}`),
      { recursive: true },
    );
  }

  return { rootDir, deploymentRootDir };
}

describe('runConfigInit', () => {
  it('writes the configuration beside the application and fills both secrets', async () => {
    const { rootDir } = await createApplication({ drivers: ['sqlite'] });

    const result = await runConfigInit({ rootDir, environment: {} });

    expect(result.dialect).toBe('sqlite');
    expect(result.mode).toBe('source');
    expect(result.configFile).toBe(path.join(rootDir, 'config.yml'));

    const written = await readFile(result.configFile, 'utf8');
    expect(written).not.toContain('replace-with-a-unique-secret');
    const parsed = parse(written) as {
      auth: { secret: string };
      session: { secret: string };
    };
    expect(parsed.auth.secret).toMatch(/^[\w-]{20,}$/u);
    expect(parsed.session.secret).toBe(parsed.auth.secret);
  });

  it('applies the selected dialect and leaves the other connections alone', async () => {
    const { rootDir } = await createApplication({
      drivers: ['sqlite', 'postgres'],
    });

    const result = await runConfigInit({
      rootDir,
      dialect: 'postgres',
      environment: {},
    });

    const parsed = parse(await readFile(result.configFile, 'utf8')) as {
      database: {
        default: string;
        connections: Record<string, Record<string, unknown>>;
      };
    };
    expect(parsed.database.connections.main).toMatchObject({
      dialect: 'postgres',
      port: 5432,
      schema: 'public',
      schemaManagement: 'managed',
    });
    // The policy the example set on the main connection survives the replacement.
    expect(parsed.database.connections.main.migrations).toEqual({
      autoRun: true,
    });
    // A second connection belongs to the application, not to the dialect choice.
    expect(parsed.database.connections.analytics).toMatchObject({
      dialect: 'sqlite',
    });
  });

  /**
   * The property the whole command is ordered around: a run that cannot finish must leave nothing behind, or the
   * retry after installing the driver would be refused for an application that is "already configured".
   */
  it('writes nothing when the driver is missing, and succeeds when it appears', async () => {
    const { rootDir } = await createApplication({ drivers: ['sqlite'] });

    await expect(
      runConfigInit({ rootDir, dialect: 'postgres', environment: {} }),
    ).rejects.toMatchObject({
      reason: 'driver-missing',
      suggestedCommand: 'pnpm add @nocobase/db-postgres',
    });
    expect(existsSync(path.join(rootDir, 'config.yml'))).toBe(false);

    await mkdir(
      path.join(rootDir, 'node_modules', '@nocobase', 'db-postgres'),
      { recursive: true },
    );

    const result = await runConfigInit({
      rootDir,
      dialect: 'postgres',
      environment: {},
    });
    expect(result.dialect).toBe('postgres');
  });

  it('reports having no driver at all with the command that installs one', async () => {
    const { rootDir } = await createApplication({ drivers: [] });

    await expect(
      runConfigInit({ rootDir, environment: {} }),
    ).rejects.toMatchObject({
      reason: 'no-drivers',
      suggestedCommand: 'pnpm add @nocobase/db-sqlite',
    });
  });

  it('rejects a dialect the runtime has no loader for', async () => {
    const { rootDir } = await createApplication({ drivers: ['sqlite'] });

    await expect(
      runConfigInit({ rootDir, dialect: 'cockroach', environment: {} }),
    ).rejects.toMatchObject({ reason: 'unknown-dialect' });
  });

  /** Without a terminal the choice cannot be asked for, so the flag that would have supplied it is named instead. */
  it('requires --dialect when several drivers are installed and nothing can ask', async () => {
    const { rootDir } = await createApplication({
      drivers: ['sqlite', 'mysql'],
    });

    await expect(
      runConfigInit({ rootDir, environment: {} }),
    ).rejects.toMatchObject({
      reason: 'dialect-required',
    });
  });

  it('asks which driver to use when it can, and only offers installed ones', async () => {
    const { rootDir } = await createApplication({
      drivers: ['sqlite', 'mysql'],
    });
    const offered: string[][] = [];

    const result = await runConfigInit({
      rootDir,
      environment: {},
      selectDialect: async (available) => {
        offered.push([...available]);
        return 'mysql';
      },
    });

    expect(offered).toEqual([['sqlite', 'mysql']]);
    expect(result.dialect).toBe('mysql');
  });

  it.each(['yml', 'yaml', 'toml', 'json'])(
    'refuses when config.%s already exists',
    async (extension) => {
      const { rootDir } = await createApplication({ drivers: ['sqlite'] });
      await writeFile(path.join(rootDir, `config.${extension}`), '');

      await expect(
        runConfigInit({ rootDir, environment: {} }),
      ).rejects.toMatchObject({ reason: 'already-configured' });
    },
  );

  it('replaces an existing file with --force', async () => {
    const { rootDir } = await createApplication({ drivers: ['sqlite'] });
    await writeFile(path.join(rootDir, 'config.yml'), 'stale: true\n');

    const result = await runConfigInit({
      rootDir,
      force: true,
      environment: {},
    });

    expect(await readFile(result.configFile, 'utf8')).not.toContain('stale');
  });

  it('resolves --config against the root the runtime was given', async () => {
    const { rootDir } = await createApplication({ drivers: ['sqlite'] });
    await mkdir(path.join(rootDir, 'etc'), { recursive: true });

    const result = await runConfigInit({
      rootDir,
      configPath: 'etc/app.yml',
      environment: {},
    });

    expect(result.configFile).toBe(path.join(rootDir, 'etc', 'app.yml'));
    expect(existsSync(result.configFile)).toBe(true);
  });

  it('names the missing directory rather than failing on the write', async () => {
    const { rootDir } = await createApplication({ drivers: ['sqlite'] });

    await expect(
      runConfigInit({ rootDir, configPath: 'etc/app.yml', environment: {} }),
    ).rejects.toMatchObject({ reason: 'directory-missing' });
  });

  /** Environment values are applied after the file, so a secret set there is the one that will actually be used. */
  it('reports the environment variables that override what it wrote', async () => {
    const { rootDir } = await createApplication({ drivers: ['sqlite'] });

    const result = await runConfigInit({
      rootDir,
      environment: { AUTH_SECRET: 'from-env', SESSION_SECRET: ' ' },
    });

    expect(result.overriddenByEnvironment).toEqual(['AUTH_SECRET']);
  });

  it('still writes usable secrets for an application with no example', async () => {
    const { rootDir } = await createApplication({
      drivers: ['sqlite'],
      example: null,
    });

    const result = await runConfigInit({ rootDir, environment: {} });
    const parsed = parse(await readFile(result.configFile, 'utf8')) as {
      auth: { secret: string };
    };

    expect(parsed.auth.secret).toMatch(/^[\w-]{20,}$/u);
  });

  describe('in a deployment', () => {
    it('writes beside dist and reads the dialects the build carried', async () => {
      const { rootDir, deploymentRootDir } = await createApplication({
        mode: 'deployment',
        drivers: ['postgres'],
      });

      expect(await findAvailableDialects(rootDir, 'deployment')).toEqual([
        'postgres',
      ]);

      const result = await runConfigInit({ rootDir, environment: {} });

      expect(result.mode).toBe('deployment');
      expect(result.configFile).toBe(
        path.join(deploymentRootDir, 'config.yml'),
      );
      expect(result.dialect).toBe('postgres');
    });

    /** Nothing here can install a driver, so the remedy is in the application sources rather than a pnpm command. */
    it('does not suggest installing a driver it cannot install', async () => {
      const { rootDir } = await createApplication({
        mode: 'deployment',
        drivers: ['postgres'],
      });

      const error = await runConfigInit({
        rootDir,
        dialect: 'mysql',
        environment: {},
      }).catch((cause: unknown) => cause as ConfigInitError);

      expect(error).toBeInstanceOf(ConfigInitError);
      expect(error.reason).toBe('driver-missing');
      expect(error.suggestedCommand).toBeUndefined();
      expect(error.message).toContain('build again');
    });
  });

  it('fails clearly when the directory holds no application', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'nocobase-empty-'));
    temporaryDirectories.push(base);

    await expect(
      runConfigInit({ rootDir: base, environment: {} }),
    ).rejects.toMatchObject({ reason: 'application-not-found' });
  });
});
