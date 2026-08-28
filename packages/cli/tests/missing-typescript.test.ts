// Registering into an application that has no TypeScript.
//
// These run the library in a child process rather than in-process. Vitest resolves modules through its own graph, so a
// throwaway application under the system temp directory still finds this repository's hoisted TypeScript and the
// degraded path never triggers. The child also has to drop the NODE_PATH vitest exports, which points at the pnpm
// store and would resolve TypeScript from there for the same reason. What is left resolves the way the published CLI
// does, which is the behaviour under test.
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, '..');
const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

const CLIENT_SOURCE = `import {
  defineClientPlugins,
  type AppClientPlugins,
} from '@nocobase/app-client/plugins';

const clientPlugins: AppClientPlugins = defineClientPlugins([]);

export default clientPlugins;
`;

/** An application with a plugin installed and deliberately no TypeScript of its own. */
async function createApp(): Promise<string> {
  const appRoot = await mkdtemp(path.join(os.tmpdir(), 'nb3-no-ts-'));
  created.push(appRoot);
  await writeFile(
    path.join(appRoot, 'package.json'),
    `${JSON.stringify({ name: 'demo-app', nocobase: { plugins: {} } }, null, 2)}\n`,
  );
  await mkdir(path.join(appRoot, 'client'), { recursive: true });
  await writeFile(path.join(appRoot, 'client', 'plugins.ts'), CLIENT_SOURCE);

  const pluginDirectory = path.join(
    appRoot,
    'node_modules',
    '@nocobase',
    'app-plugin-audit-log',
  );
  await mkdir(pluginDirectory, { recursive: true });
  await writeFile(
    path.join(pluginDirectory, 'package.json'),
    JSON.stringify({
      exports: { './client/plugin': './client/plugin.js' },
      name: '@nocobase/app-plugin-audit-log',
      version: '1.0.0',
    }),
  );
  return appRoot;
}

/** Plans a registration in a child process and returns the plan as JSON. */
async function planInChildProcess(
  appRoot: string,
): Promise<Record<string, unknown>> {
  const script = `
    const { planPluginRegistration } = await import(${JSON.stringify(path.join(packageRoot, 'src/lib/plugin-registration.ts'))});
    const plan = await planPluginRegistration({
      appRoot: ${JSON.stringify(appRoot)},
      dependencyRange: '^1.0.0',
      packageName: '@nocobase/app-plugin-audit-log',
      pluginDirectory: ${JSON.stringify(path.join(appRoot, 'node_modules/@nocobase/app-plugin-audit-log'))},
    });
    process.stdout.write(JSON.stringify(plan));
  `;
  const { NODE_PATH: _discarded, ...env } = process.env;
  const { stdout } = await run(
    process.execPath,
    ['--input-type=module', '-e', script],
    { env },
  );
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe('registering without TypeScript', () => {
  it('still records the dependency and the registration', async () => {
    const plan = await planInChildProcess(await createApp());

    expect(plan.changed).toBe(true);
    expect(plan.manifestChanged).toBe(true);
    expect(plan.clientPluginsChanged).toBe(false);
    expect(plan.skippedClientEntry).toBe('no-typescript');
  });

  it('reports the exact lines left for a person or agent to add', async () => {
    const appRoot = await createApp();

    const plan = await planInChildProcess(appRoot);

    expect(plan.manualClientEdit).toEqual({
      entry: 'auditLog(),',
      filePath: path.join(appRoot, 'client', 'plugins.ts'),
      importStatement:
        "import auditLog from '@nocobase/app-plugin-audit-log/client/plugin';",
      localName: 'auditLog',
    });
  });

  it('writes a manifest that carries the plugin, so only the client edit is left', async () => {
    const appRoot = await createApp();

    const plan = await planInChildProcess(appRoot);
    const manifest = JSON.parse(plan.manifestText as string) as {
      devDependencies: Record<string, string>;
      nocobase: { plugins: Record<string, { enabled: boolean }> };
    };

    expect(manifest.devDependencies['@nocobase/app-plugin-audit-log']).toBe(
      '^1.0.0',
    );
    expect(manifest.nocobase.plugins['@nocobase/app-plugin-audit-log']).toEqual(
      { enabled: true },
    );
    // The plan carries no new client source, so applying it cannot touch that file.
    expect(plan.clientPluginsText).toBeUndefined();
    expect(
      await readFile(path.join(appRoot, 'client', 'plugins.ts'), 'utf8'),
    ).toBe(CLIENT_SOURCE);
  });
});
