import type { Config } from '@oclif/core';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadTestConfig, runCommand } from './helpers.ts';

const created: string[] = [];
const require = createRequire(import.meta.url);
let config: Config;

function moduleDirectory(packageName: string): string {
  return path.dirname(require.resolve(`${packageName}/package.json`));
}

beforeAll(async () => {
  config = await loadTestConfig();
});

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createAppWithInstalledPlugin({
  client = true,
  server = true,
  skills = true,
}: {
  client?: boolean;
  server?: boolean;
  skills?: boolean;
} = {}): Promise<string> {
  const appRoot = await mkdtemp(
    path.join(os.tmpdir(), 'nb3-register-command-'),
  );
  created.push(appRoot);

  await writeFile(
    path.join(appRoot, 'package.json'),
    `${JSON.stringify({ name: 'demo-app', private: true }, null, 2)}\n`,
  );
  await mkdir(path.join(appRoot, 'node_modules'), { recursive: true });
  for (const dependency of ['typescript', 'prettier']) {
    await symlink(
      moduleDirectory(dependency),
      path.join(appRoot, 'node_modules', dependency),
      'dir',
    );
  }

  const pluginRoot = path.join(
    appRoot,
    'node_modules',
    '@nocobase',
    'app-plugin-audit-log',
  );
  await mkdir(pluginRoot, { recursive: true });
  await writeFile(
    path.join(pluginRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: '@nocobase/app-plugin-audit-log',
        version: '1.0.0',
        exports: {
          ...(client ? { './client': './client/index.js' } : {}),
          ...(server ? { './server/plugin': './server/plugin.js' } : {}),
        },
      },
      null,
      2,
    )}\n`,
  );
  if (skills) {
    const skillRoot = path.join(
      pluginRoot,
      'skills',
      'nocobase-app-plugin-audit-log',
    );
    await mkdir(skillRoot, { recursive: true });
    await writeFile(path.join(skillRoot, 'SKILL.md'), '# Audit log\n');
  }

  return appRoot;
}

describe('app plugin register command', () => {
  it('keeps every registration surface unchanged during a dry run', async () => {
    const appRoot = await createAppWithInstalledPlugin();
    const manifestPath = path.join(appRoot, 'package.json');
    const originalManifest = await readFile(manifestPath, 'utf8');
    const clientPath = path.join(appRoot, 'client', 'plugins.ts');
    const serverPath = path.join(appRoot, 'server', 'plugins.ts');
    const synchronizedSkillPath = path.join(
      appRoot,
      '.agents',
      'skills',
      'nocobase-app-plugin-audit-log',
      'SKILL.md',
    );

    const result = await runCommand(config, 'app:plugin:register', [
      'audit-log',
      '--dir',
      appRoot,
      '--dry-run',
    ]);

    expect(result.stdout).toContain(
      'Would register @nocobase/app-plugin-audit-log as enabled',
    );
    expect(await readFile(manifestPath, 'utf8')).toBe(originalManifest);
    expect(existsSync(clientPath)).toBe(false);
    expect(existsSync(serverPath)).toBe(false);
    expect(existsSync(synchronizedSkillPath)).toBe(false);
  });

  it.each([
    ['client-only', { client: true, server: false }, true, false],
    ['server-only', { client: false, server: true }, false, true],
    ['full-stack', { client: true, server: true }, true, true],
  ] as const)(
    'registers a %s plugin only in the composition roots it exports',
    async (_name, plugin, clientExpected, serverExpected) => {
      const appRoot = await createAppWithInstalledPlugin(plugin);

      await runCommand(config, 'app:plugin:register', [
        'audit-log',
        '--dir',
        appRoot,
        '--no-install',
      ]);

      const manifest = JSON.parse(
        await readFile(path.join(appRoot, 'package.json'), 'utf8'),
      ) as {
        devDependencies?: Record<string, string>;
        nocobase?: { plugins?: Record<string, { enabled: boolean }> };
      };
      expect(manifest.devDependencies).toEqual({
        '@nocobase/app-plugin-audit-log': '^1.0.0',
      });
      expect(manifest.nocobase?.plugins).toEqual({
        '@nocobase/app-plugin-audit-log': { enabled: true },
      });
      expect(existsSync(path.join(appRoot, 'client', 'plugins.ts'))).toBe(
        clientExpected,
      );
      expect(existsSync(path.join(appRoot, 'server', 'plugins.ts'))).toBe(
        serverExpected,
      );
      expect(
        existsSync(
          path.join(
            appRoot,
            '.agents',
            'skills',
            'nocobase-app-plugin-audit-log',
            'SKILL.md',
          ),
        ),
      ).toBe(true);
    },
  );

  it('registers disabled metadata without wiring runtime entries', async () => {
    const appRoot = await createAppWithInstalledPlugin();

    await runCommand(config, 'app:plugin:register', [
      'audit-log',
      '--dir',
      appRoot,
      '--no-install',
      '--disabled',
    ]);

    const manifest = JSON.parse(
      await readFile(path.join(appRoot, 'package.json'), 'utf8'),
    ) as { nocobase?: { plugins?: Record<string, { enabled: boolean }> } };
    expect(manifest.nocobase?.plugins).toEqual({
      '@nocobase/app-plugin-audit-log': { enabled: false },
    });
    expect(existsSync(path.join(appRoot, 'client', 'plugins.ts'))).toBe(false);
    expect(existsSync(path.join(appRoot, 'server', 'plugins.ts'))).toBe(false);
  });

  it('skips Skill synchronization when --no-skills is explicit', async () => {
    const appRoot = await createAppWithInstalledPlugin();

    await runCommand(config, 'app:plugin:register', [
      'audit-log',
      '--dir',
      appRoot,
      '--no-install',
      '--no-skills',
    ]);

    expect(existsSync(path.join(appRoot, '.agents', 'skills'))).toBe(false);
  });

  it('is idempotent after registration and unregisters every owned surface', async () => {
    const appRoot = await createAppWithInstalledPlugin();
    const args = ['audit-log', '--dir', appRoot, '--no-install'];

    await runCommand(config, 'app:plugin:register', args);
    const manifestPath = path.join(appRoot, 'package.json');
    const clientPath = path.join(appRoot, 'client', 'plugins.ts');
    const serverPath = path.join(appRoot, 'server', 'plugins.ts');
    const before = await Promise.all(
      [manifestPath, clientPath, serverPath].map((file) =>
        readFile(file, 'utf8'),
      ),
    );

    const repeated = await runCommand(config, 'app:plugin:register', args);
    expect(repeated.stdout).toContain('is already registered');
    await expect(
      Promise.all(
        [manifestPath, clientPath, serverPath].map((file) =>
          readFile(file, 'utf8'),
        ),
      ),
    ).resolves.toEqual(before);

    await runCommand(config, 'app:plugin:unregister', args);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      devDependencies?: Record<string, string>;
      nocobase?: { plugins?: Record<string, unknown> };
    };
    expect(manifest.devDependencies).toEqual({});
    expect(manifest.nocobase?.plugins).toEqual({});
    expect(await readFile(clientPath, 'utf8')).not.toContain('audit-log');
    expect(await readFile(serverPath, 'utf8')).not.toContain('audit-log');
    expect(existsSync(path.join(appRoot, '.agents', 'skills'))).toBe(true);
    expect(
      existsSync(
        path.join(
          appRoot,
          '.agents',
          'skills',
          'nocobase-app-plugin-audit-log',
        ),
      ),
    ).toBe(false);
  });

  it('keeps every registered surface unchanged during unregister dry-run', async () => {
    const appRoot = await createAppWithInstalledPlugin();
    const args = ['audit-log', '--dir', appRoot, '--no-install'];
    await runCommand(config, 'app:plugin:register', args);
    const paths = [
      path.join(appRoot, 'package.json'),
      path.join(appRoot, 'client', 'plugins.ts'),
      path.join(appRoot, 'server', 'plugins.ts'),
      path.join(
        appRoot,
        '.agents',
        'skills',
        'nocobase-app-plugin-audit-log',
        'SKILL.md',
      ),
    ];
    const before = await Promise.all(
      paths.map((file) => readFile(file, 'utf8')),
    );

    const result = await runCommand(config, 'app:plugin:unregister', [
      ...args,
      '--dry-run',
    ]);

    expect(result.stdout).toContain('Would unregister');
    await expect(
      Promise.all(paths.map((file) => readFile(file, 'utf8'))),
    ).resolves.toEqual(before);
  });

  it('updates plugin-owned Skills explicitly without touching app-owned Skills', async () => {
    const appRoot = await createAppWithInstalledPlugin();
    const args = ['audit-log', '--dir', appRoot, '--no-install'];
    await runCommand(config, 'app:plugin:register', args);

    const installedSkill = path.join(
      appRoot,
      'node_modules',
      '@nocobase',
      'app-plugin-audit-log',
      'skills',
      'nocobase-app-plugin-audit-log',
      'SKILL.md',
    );
    const synchronizedSkill = path.join(
      appRoot,
      '.agents',
      'skills',
      'nocobase-app-plugin-audit-log',
      'SKILL.md',
    );
    const appSkill = path.join(
      appRoot,
      '.agents',
      'skills',
      'my-app-skill',
      'SKILL.md',
    );
    await writeFile(installedSkill, '# Updated upstream\n');
    await mkdir(path.dirname(appSkill), { recursive: true });
    await writeFile(appSkill, '# App owned\n');

    const dryRun = await runCommand(config, 'app:plugin:skills:sync', [
      '--dir',
      appRoot,
      '--plugin',
      'audit-log',
      '--dry-run',
      '--json',
    ]);
    const response = JSON.parse(dryRun.stdout) as {
      schemaVersion: number;
      ok: boolean;
      operation: string;
      result: {
        dryRun: boolean;
        copies: Array<{ skillName: string }>;
      };
    };
    expect(response).toMatchObject({
      schemaVersion: 1,
      ok: true,
      operation: 'plugin:skills:sync',
    });
    expect(response.result.dryRun).toBe(true);
    expect(response.result.copies).toEqual([
      expect.objectContaining({
        skillName: 'nocobase-app-plugin-audit-log',
      }),
    ]);
    expect(await readFile(synchronizedSkill, 'utf8')).toBe('# Audit log\n');

    await runCommand(config, 'app:plugin:skills:sync', [
      '--dir',
      appRoot,
      '--plugin',
      'audit-log',
    ]);
    expect(await readFile(synchronizedSkill, 'utf8')).toBe(
      '# Updated upstream\n',
    );
    expect(await readFile(appSkill, 'utf8')).toBe('# App owned\n');
  });

  it('prints one JSON error document when Skills synchronization fails', async () => {
    const appRoot = await createAppWithInstalledPlugin();
    const lines: string[] = [];
    const originalError = console.error;
    const originalExitCode = process.exitCode;
    console.error = (...args: unknown[]): void => {
      lines.push(args.map((argument) => String(argument)).join(' '));
    };

    try {
      await expect(
        config.runCommand('app:plugin:skills:sync', [
          '--dir',
          appRoot,
          '--plugin',
          'missing',
          '--dry-run',
          '--json',
        ]),
      ).resolves.toBeUndefined();
      expect(process.exitCode).toBe(1);
    } finally {
      console.error = originalError;
      process.exitCode = originalExitCode;
    }

    expect(lines).toHaveLength(1);
    const response = JSON.parse(lines[0]) as {
      schemaVersion: number;
      ok: boolean;
      operation: string;
      error: { code: string; message: string; suggestions: string[] };
    };
    expect(response).toMatchObject({
      schemaVersion: 1,
      ok: false,
      operation: 'plugin:skills:sync',
      error: {
        code: 'PLUGIN_NOT_INSTALLED',
        message: expect.any(String),
        suggestions: expect.any(Array),
      },
    });
  });
});
