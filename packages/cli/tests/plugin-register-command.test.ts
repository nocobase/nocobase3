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

async function createAppWithInstalledPlugin(): Promise<string> {
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
  await mkdir(
    path.join(pluginRoot, 'skills', 'nocobase-app-plugin-audit-log'),
    { recursive: true },
  );
  await writeFile(
    path.join(pluginRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: '@nocobase/app-plugin-audit-log',
        version: '1.0.0',
        exports: {
          './client': './client/index.js',
          './server/plugin': './server/plugin.js',
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(
      pluginRoot,
      'skills',
      'nocobase-app-plugin-audit-log',
      'SKILL.md',
    ),
    '# Audit log\n',
  );

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
});
