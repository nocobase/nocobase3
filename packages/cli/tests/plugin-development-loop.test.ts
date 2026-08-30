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

import type { PluginCapability } from '../../create-plugin/src/lib/capabilities.ts';
import { createPlugin } from '../../create-plugin/src/lib/scaffold.ts';
import { loadTestConfig, runCommand } from './helpers.ts';

const created: string[] = [];
const require = createRequire(import.meta.url);
let config: Config;

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

function moduleDirectory(packageName: string): string {
  return path.dirname(require.resolve(`${packageName}/package.json`));
}

async function createLoopFixture(
  capabilities: readonly PluginCapability[],
): Promise<{ appRoot: string }> {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), 'nb3-plugin-development-loop-'),
  );
  created.push(workspaceRoot);
  await mkdir(path.join(workspaceRoot, 'packages'));
  const generated = await createPlugin({
    capabilities,
    install: false,
    name: 'agent-loop',
    now: new Date(2026, 7, 30),
    repoRoot: workspaceRoot,
  });

  const appRoot = path.join(workspaceRoot, 'app');
  await mkdir(path.join(appRoot, 'node_modules', '@nocobase'), {
    recursive: true,
  });
  await writeFile(
    path.join(appRoot, 'package.json'),
    `${JSON.stringify({ name: '@nocobase/agent-loop-app', private: true }, null, 2)}\n`,
  );
  for (const dependency of ['typescript', 'prettier']) {
    await symlink(
      moduleDirectory(dependency),
      path.join(appRoot, 'node_modules', dependency),
      'dir',
    );
  }
  await symlink(
    generated.targetDirectory,
    path.join(appRoot, 'node_modules', '@nocobase', 'app-plugin-agent-loop'),
    'dir',
  );
  return { appRoot };
}

describe('Agent plugin development loop', () => {
  it.each([
    ['client-only', ['client.routes', 'client.components'], true, false, false],
    [
      'server-only',
      ['server.providers', 'server.routes', 'server.jobs'],
      false,
      true,
      false,
    ],
    [
      'full-stack',
      [
        'client.routes',
        'client.components',
        'server.providers',
        'server.routes',
        'skills',
      ],
      true,
      true,
      true,
    ],
  ] as const)(
    'creates, previews, registers, and inspects a %s plugin',
    async (
      _shape,
      capabilities,
      expectsClient,
      expectsServer,
      expectsSkill,
    ) => {
      const { appRoot } = await createLoopFixture(capabilities);
      const manifestBefore = await readFile(
        path.join(appRoot, 'package.json'),
        'utf8',
      );

      const preview = await runCommand(config, 'app:plugin:register', [
        'agent-loop',
        '--dir',
        appRoot,
        '--no-install',
        '--dry-run',
        '--json',
      ]);
      const previewResult = JSON.parse(preview.stdout) as {
        status: string;
        result: {
          plan: {
            clientPluginsChanged: boolean;
            serverPluginsChanged: boolean;
          };
        };
      };
      expect(previewResult.status).toBe('success');
      expect(previewResult.result.plan.clientPluginsChanged).toBe(
        expectsClient,
      );
      expect(previewResult.result.plan.serverPluginsChanged).toBe(
        expectsServer,
      );
      expect(await readFile(path.join(appRoot, 'package.json'), 'utf8')).toBe(
        manifestBefore,
      );
      expect(existsSync(path.join(appRoot, 'client', 'plugins.ts'))).toBe(
        false,
      );
      expect(existsSync(path.join(appRoot, 'server', 'plugins.ts'))).toBe(
        false,
      );

      const registered = await runCommand(config, 'app:plugin:register', [
        'agent-loop',
        '--dir',
        appRoot,
        '--no-install',
        '--json',
      ]);
      expect(JSON.parse(registered.stdout)).toMatchObject({
        ok: true,
        operation: 'plugin:register',
        status: 'success',
      });
      expect(existsSync(path.join(appRoot, 'client', 'plugins.ts'))).toBe(
        expectsClient,
      );
      expect(existsSync(path.join(appRoot, 'server', 'plugins.ts'))).toBe(
        expectsServer,
      );
      expect(
        existsSync(
          path.join(
            appRoot,
            '.agents',
            'skills',
            'nocobase-app-plugin-agent-loop',
            'SKILL.md',
          ),
        ),
      ).toBe(expectsSkill);

      const inspected = await runCommand(config, 'app:plugin:inspect', [
        'agent-loop',
        '--dir',
        appRoot,
        '--json',
      ]);
      expect(JSON.parse(inspected.stdout)).toMatchObject({
        ok: true,
        operation: 'plugin:inspect',
        status: 'success',
        result: {
          plugin: {
            exports: { client: expectsClient, serverPlugin: expectsServer },
          },
          composition: {
            client: { expected: expectsClient, registered: expectsClient },
            server: { expected: expectsServer, registered: expectsServer },
          },
          consistent: true,
          issues: [],
        },
      });

      const repeated = await runCommand(config, 'app:plugin:register', [
        'agent-loop',
        '--dir',
        appRoot,
        '--no-install',
        '--json',
      ]);
      expect(JSON.parse(repeated.stdout)).toMatchObject({
        ok: true,
        operation: 'plugin:register',
        status: 'success-noop',
      });
    },
  );
});
