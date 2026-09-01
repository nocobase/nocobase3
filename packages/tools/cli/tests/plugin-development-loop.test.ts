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

import { inspectAppClient } from '../../../templates/app-template-default/scripts/inspect-client.mjs';
import { inspectAppServer } from '../../../templates/app-template-default/scripts/inspect-server.mjs';
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

/**
 * Where the fixture's workspace dependencies live, relative to `packages/`.
 *
 * They are linked from their source directories rather than resolved by name, because the CLI does not depend on
 * them — the fixture only needs them on disk for the generated app to import. The paths are spelled out because the
 * four sit in three different category directories.
 */
const FIXTURE_DEPENDENCY_DIRECTORIES: Readonly<Record<string, string>> = {
  '@nocobase/app-client': 'app/app-client',
  '@nocobase/app-server': 'app/app-server',
  '@nocobase/dev-config': 'tools/dev-config',
  '@nocobase/service-provider': 'libs/service-provider',
};

async function createLoopFixture(
  capabilities: readonly PluginCapability[],
): Promise<{ appRoot: string; pluginRoot: string }> {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), 'nb3-plugin-development-loop-'),
  );
  created.push(workspaceRoot);
  await mkdir(path.join(workspaceRoot, 'packages', 'plugins'), {
    recursive: true,
  });
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
  await mkdir(path.join(workspaceRoot, 'node_modules', '@nocobase'), {
    recursive: true,
  });
  await writeFile(
    path.join(appRoot, 'package.json'),
    `${JSON.stringify({ name: '@nocobase/agent-loop-app', private: true }, null, 2)}\n`,
  );
  await mkdir(path.join(appRoot, 'client'));
  await writeFile(
    path.join(appRoot, 'client', 'runtime.ts'),
    `export default {
  packageName: '@nocobase/agent-loop-app',
  config: async () => ({}),
  serviceProviders: [],
  reactProviders: [],
  routes: [],
  locales: {},
  plugins: [],
};\n`,
  );
  for (const dependency of ['typescript', 'prettier', 'tsx']) {
    await symlink(
      moduleDirectory(dependency),
      path.join(appRoot, 'node_modules', dependency),
      'dir',
    );
  }
  for (const dependency of Object.keys(FIXTURE_DEPENDENCY_DIRECTORIES)) {
    const packageDirectory = path.resolve(
      import.meta.dirname,
      '../../..',
      FIXTURE_DEPENDENCY_DIRECTORIES[dependency],
    );
    for (const modulesRoot of [
      path.join(appRoot, 'node_modules'),
      path.join(workspaceRoot, 'node_modules'),
    ]) {
      await symlink(
        packageDirectory,
        path.join(modulesRoot, ...dependency.split('/')),
        'dir',
      );
    }
  }
  await symlink(
    generated.targetDirectory,
    path.join(appRoot, 'node_modules', '@nocobase', 'app-plugin-agent-loop'),
    'dir',
  );
  return { appRoot, pluginRoot: generated.targetDirectory };
}

async function runAppInspector(
  appRoot: string,
  kind: 'client' | 'server',
): Promise<Record<string, unknown>> {
  return kind === 'client'
    ? inspectAppClient({ appRoot })
    : inspectAppServer({ appRoot });
}

describe('Agent plugin development loop', () => {
  it.each([
    ['client-only', ['client.routes', 'client.components'], true, false, false],
    [
      'server-only',
      ['server.service-providers', 'server.routes', 'server.jobs'],
      false,
      true,
      false,
    ],
    [
      'full-stack',
      [
        'client.routes',
        'client.components',
        'server.service-providers',
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
      const { appRoot, pluginRoot } = await createLoopFixture(capabilities);
      const manifestBefore = await readFile(
        path.join(appRoot, 'package.json'),
        'utf8',
      );

      if (expectsClient) {
        await writeFile(
          path.join(pluginRoot, 'client', 'routes.ts'),
          `import { defineAppRoutes, defineSettingsRoutes, type AppClientRouteContribution } from '@nocobase/app-client/plugins';\n\nconst routes: readonly AppClientRouteContribution[] = [\n  defineAppRoutes([{ name: 'agent-loop', path: '/agent-loop', auth: 'required', componentLoader: async () => ({ default: () => null }) }]),\n  defineSettingsRoutes([{ name: 'agent-loop', path: '/agent-loop', navigation: { title: 'Agent loop' }, access: { resource: 'agent-loop.settings', action: 'read' }, componentLoader: async () => ({ default: () => null }) }]),\n];\n\nexport default routes;\n`,
        );
      }
      if (expectsServer) {
        await writeFile(
          path.join(pluginRoot, 'server', 'routes', 'index.ts'),
          `import type { AppPluginApplication } from '@nocobase/app-server/plugins';\nimport { defineApiRoutes, defineRootRoutes, type AppRouteContribution } from '@nocobase/app-server/router';\n\nconst unavailable = (): never => { throw new Error('Inspection must not execute Route factories.'); };\nconst routes: readonly AppRouteContribution<AppPluginApplication>[] = [defineRootRoutes(unavailable), defineApiRoutes(unavailable)];\n\nexport default routes;\n`,
        );
      }

      if (expectsSkill) {
        const sourceSkill = path.join(
          pluginRoot,
          'skills',
          'nocobase-app-plugin-agent-loop',
          'SKILL.md',
        );
        const draft = await readFile(sourceSkill, 'utf8');
        expect(draft).toContain('## Public surfaces');
        expect(draft).toContain('## Permissions and constraints');
        expect(draft).toContain('Development draft');
        expect(draft).not.toContain('/api/example');
        await writeFile(
          sourceSkill,
          `---\nname: nocobase-app-plugin-agent-loop\ndescription: Integrate the implemented Agent Loop plugin capability into an App.\n---\n\n# Agent Loop\n\nUse the plugin's implemented public surfaces and verify the result in the App.\n`,
        );
      }

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

      if (expectsClient) {
        const clientInspection = await runAppInspector(appRoot, 'client');
        expect(clientInspection).toMatchObject({
          consistent: true,
          issues: [],
          routes: [
            {
              packageName: '@nocobase/app-plugin-agent-loop',
              parent: 'app',
              path: '/agent-loop',
            },
          ],
          settings: [
            {
              access: { resource: 'agent-loop.settings', action: 'read' },
              packageName: '@nocobase/app-plugin-agent-loop',
              parent: 'settings',
              path: '/settings/agent-loop',
            },
          ],
        });
      }
      if (expectsServer) {
        const serverInspection = await runAppInspector(appRoot, 'server');
        expect(serverInspection).toMatchObject({
          issues: [],
          routes: [
            {
              packageName: '@nocobase/app-plugin-agent-loop',
              scope: 'root',
            },
            {
              packageName: '@nocobase/app-plugin-agent-loop',
              scope: 'api',
            },
          ],
        });
      }

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

      if (expectsSkill) {
        const sourceSkill = path.join(
          pluginRoot,
          'skills',
          'nocobase-app-plugin-agent-loop',
          'SKILL.md',
        );
        const synchronizedSkill = path.join(
          appRoot,
          '.agents',
          'skills',
          'nocobase-app-plugin-agent-loop',
          'SKILL.md',
        );
        const updatedSkill = `${await readFile(sourceSkill, 'utf8')}\nUpdated after registration.\n`;
        await writeFile(sourceSkill, updatedSkill);

        const stale = await runCommand(config, 'app:plugin:inspect', [
          'agent-loop',
          '--dir',
          appRoot,
          '--json',
        ]);
        expect(JSON.parse(stale.stdout)).toMatchObject({
          result: {
            consistent: false,
            issues: [{ code: 'SKILLS_OUT_OF_DATE' }],
          },
        });

        await runCommand(config, 'app:plugin:skills:sync', [
          '--dir',
          appRoot,
          '--plugin',
          'agent-loop',
        ]);
        expect(await readFile(synchronizedSkill, 'utf8')).toBe(updatedSkill);
      }

      await runCommand(config, 'app:plugin:unregister', [
        'agent-loop',
        '--dir',
        appRoot,
        '--no-install',
      ]);
      if (expectsClient) {
        expect(
          await readFile(path.join(appRoot, 'client', 'plugins.ts'), 'utf8'),
        ).not.toContain('@nocobase/app-plugin-agent-loop');
      }
      if (expectsServer) {
        expect(
          await readFile(path.join(appRoot, 'server', 'plugins.ts'), 'utf8'),
        ).not.toContain('@nocobase/app-plugin-agent-loop');
      }
      expect(
        existsSync(
          path.join(
            appRoot,
            '.agents',
            'skills',
            'nocobase-app-plugin-agent-loop',
          ),
        ),
      ).toBe(false);
    },
  );
});
