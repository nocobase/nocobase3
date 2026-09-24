import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { AppConfig, createAppPaths } from '@nocobase/app-server/config';

import type { AppCommandRuntime } from '../src/context.js';
import { ConfigSetError, runConfigSet } from '../src/lib/config-set.js';

const directories: string[] = [];

afterEach(async () => {
  while (directories.length > 0) {
    await rm(directories.pop()!, { recursive: true, force: true });
  }
});

const FILE = [
  '# The application configuration.',
  'server:',
  '  # The port the server listens on.',
  '  port: 13000',
  'database:',
  '  connections:',
  '    main:',
  '      dialect: postgres',
  '      host: localhost',
  'notification:',
  '  channels:',
  '    - type: in-app',
  '',
].join('\n');

/**
 * An application whose runtime loads the configuration file for real, with `environment` layered over it the way the
 * application's environment mappings layer it, so an override is visible exactly as it would be at startup.
 */
async function createApplication(
  options: {
    readonly file?: string | null;
    readonly environment?: Record<string, unknown>;
    readonly loads?: boolean;
  } = {},
) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'nocobase-config-set-'));
  directories.push(rootDir);
  await mkdir(path.join(rootDir, 'server'), { recursive: true });
  await writeFile(path.join(rootDir, 'server', 'runtime.ts'), 'export {};\n');
  await writeFile(
    path.join(rootDir, 'config.example.yml'),
    'client:\n  app: {}\n',
  );
  const configFile = path.join(rootDir, 'config.yml');
  if (options.file !== null) await writeFile(configFile, options.file ?? FILE);

  const loadRuntime = async (): Promise<AppCommandRuntime> => {
    if (options.loads === false)
      throw new Error('The configuration does not load.');
    const config = new AppConfig().loadFile(configFile, { optional: true });
    await config.loadAll();
    config.mergeDefaults({
      server: {},
      database: {},
      notification: {},
      i18n: {},
    });
    const runtime = {
      config: {
        layers: () => config.layers(),
        get: (key: string) => {
          const override = key
            .split('.')
            .reduce<unknown>(
              (value, segment) =>
                typeof value === 'object' && value !== null
                  ? (value as Record<string, unknown>)[segment]
                  : undefined,
              options.environment,
            );
          return override === undefined ? config.get(key) : override;
        },
      },
      paths: createAppPaths({ rootDir, deploymentRootDir: '.' }),
      scope: { destroy: async () => undefined },
    };
    return runtime as unknown as AppCommandRuntime;
  };

  return { rootDir, configFile, loadRuntime };
}

describe('runConfigSet', () => {
  it('sets several values in one write and keeps every comment', async () => {
    const { rootDir, configFile, loadRuntime } = await createApplication();

    const result = await runConfigSet({
      rootDir,
      assignments: [
        'server.port=14000',
        'database.connections.main.host=db.internal',
      ],
      loadRuntime,
      environment: {},
    });

    expect(result.changed).toEqual([
      'server.port',
      'database.connections.main.host',
    ]);
    expect(result.warnings).toEqual([]);
    const written = await readFile(configFile, 'utf8');
    expect(written).toContain(
      '# The port the server listens on.\n  port: 14000',
    );
    expect(written).toContain('host: db.internal');
    expect(written).toContain('# The application configuration.');
  });

  it('reads values the way YAML does, and keeps quoted text as text', async () => {
    const { rootDir, configFile, loadRuntime } = await createApplication();

    await runConfigSet({
      rootDir,
      assignments: [
        'server.port=14000',
        'server.startLog=false',
        'i18n.defaultLocale="zh-CN"',
        'server.name="13000"',
      ],
      loadRuntime,
      environment: {},
    });

    const written = await readFile(configFile, 'utf8');
    expect(written).toContain('port: 14000');
    expect(written).toContain('startLog: false');
    expect(written).toContain('name: "13000"');
    expect(written).toMatch(/i18n:\n {2}defaultLocale: "?zh-CN"?/u);
  });

  /** A typo fails here instead of being written into a section nothing reads. */
  it('refuses a section the application does not know, and names the one meant', async () => {
    const { rootDir, configFile, loadRuntime } = await createApplication();

    const error = await runConfigSet({
      rootDir,
      assignments: ['server.port=14000', 'databse.connections.main.host=x'],
      loadRuntime,
      environment: {},
    }).catch((cause: unknown) => cause as ConfigSetError);

    expect(error).toBeInstanceOf(ConfigSetError);
    expect(error.reason).toBe('unknown-key');
    expect(error.message).toContain('Did you mean "database"?');
    // Nothing was written, not even the valid assignment before it.
    expect(await readFile(configFile, 'utf8')).toBe(FILE);
  });

  it('knows the sections config.example.yml documents', async () => {
    const { rootDir, loadRuntime } = await createApplication();

    await expect(
      runConfigSet({
        rootDir,
        assignments: ['client.app.title=Mine'],
        loadRuntime,
        environment: {},
      }),
    ).resolves.toMatchObject({ changed: ['client.app.title'] });
  });

  /** Setting a value is also how a broken configuration is repaired, so a runtime that does not load cannot block it. */
  it('still sets values when the configuration does not load', async () => {
    const { rootDir, configFile, loadRuntime } = await createApplication({
      loads: false,
    });

    const result = await runConfigSet({
      rootDir,
      assignments: ['database.connections.main.host=db.internal'],
      loadRuntime,
      environment: {},
    });

    expect(await readFile(configFile, 'utf8')).toContain('host: db.internal');
    expect(result.warnings.join('\n')).toContain('does not load');
  });

  it('reads a value from the environment with --from-env and never echoes it', async () => {
    const { rootDir, configFile, loadRuntime } = await createApplication();

    const result = await runConfigSet({
      rootDir,
      assignments: ['database.connections.main.password=MAIN_DB_PASSWORD'],
      fromEnv: true,
      loadRuntime,
      environment: { MAIN_DB_PASSWORD: 's3cret' },
    });

    expect(await readFile(configFile, 'utf8')).toContain('password: s3cret');
    expect(JSON.stringify(result)).not.toContain('s3cret');
  });

  it('refuses --from-env when the variable is not set', async () => {
    const { rootDir, loadRuntime } = await createApplication();

    await expect(
      runConfigSet({
        rootDir,
        assignments: ['database.connections.main.password=MAIN_DB_PASSWORD'],
        fromEnv: true,
        loadRuntime,
        environment: {},
      }),
    ).rejects.toMatchObject({ reason: 'environment-variable-missing' });
  });

  it('warns when a secret is given on the command line', async () => {
    const { rootDir, loadRuntime } = await createApplication();

    const result = await runConfigSet({
      rootDir,
      assignments: ['database.connections.main.password=hunter2'],
      loadRuntime,
      environment: {},
    });

    expect(result.warnings.join('\n')).toContain('--from-env');
  });

  /** Written, and changing nothing: the one outcome that looks like success. */
  it('reports a key the environment overrides', async () => {
    const { rootDir, loadRuntime } = await createApplication({
      environment: { server: { port: 15000 } },
    });

    const result = await runConfigSet({
      rootDir,
      assignments: ['server.port=16000'],
      loadRuntime,
      environment: {},
    });

    expect(result.warnings).toEqual([
      expect.stringContaining(
        'server.port was written, but the application still reads a different value',
      ),
    ]);
  });

  it.each([
    ['server.port=[1,2]', 'invalid-assignment'],
    ['server.port', 'invalid-assignment'],
    ['server..port=1', 'invalid-assignment'],
    ['notification.channels.type=im', 'not-a-section'],
  ])('refuses %s', async (assignment, reason) => {
    const { rootDir, loadRuntime } = await createApplication();

    await expect(
      runConfigSet({
        rootDir,
        assignments: [assignment],
        loadRuntime,
        environment: {},
      }),
    ).rejects.toMatchObject({ reason });
  });

  it('sends an unconfigured application to config:init', async () => {
    const { rootDir, loadRuntime } = await createApplication({ file: null });

    await expect(
      runConfigSet({
        rootDir,
        assignments: ['server.port=1'],
        loadRuntime,
        environment: {},
      }),
    ).rejects.toMatchObject({
      reason: 'not-configured',
      suggestedCommand: 'pnpm config:init',
    });
  });

  it('writes to the file APP_CONFIG_FILE names', async () => {
    const { rootDir, loadRuntime } = await createApplication();
    const elsewhere = path.join(rootDir, 'etc.yml');
    await writeFile(elsewhere, 'server:\n  port: 1\n');

    const result = await runConfigSet({
      rootDir,
      assignments: ['server.port=2'],
      loadRuntime,
      environment: { APP_CONFIG_FILE: 'etc.yml' },
    });

    expect(result.configFile).toBe(elsewhere);
    expect(await readFile(elsewhere, 'utf8')).toContain('port: 2');
  });
});
