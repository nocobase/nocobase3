import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import { createPlugin } from '../src/lib/scaffold.ts';

const exec = promisify(execFile);
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = path.resolve(packageRoot, '../../..');

// Link existing workspace dependencies into an isolated generated plugin. No install or lockfile changes.
async function linkDependencies(target: string): Promise<void> {
  const manifest = JSON.parse(
    await readFile(path.join(target, 'package.json'), 'utf8'),
  ) as {
    peerDependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const workspacePackages: Record<string, string> = {
    '@nocobase/app-server': 'packages/app/app-server',
    '@nocobase/queue': 'packages/libs/queue',
    '@nocobase/service-provider': 'packages/libs/service-provider',
    '@nocobase/dev-config': 'packages/tools/dev-config',
  };
  for (const name of Object.keys({
    ...manifest.peerDependencies,
    ...manifest.devDependencies,
  })) {
    const destination = path.join(target, 'node_modules', name);
    await mkdir(path.dirname(destination), { recursive: true });
    await symlink(
      workspacePackages[name]
        ? path.join(repoRoot, workspacePackages[name])
        : path.join(packageRoot, 'node_modules', name),
      destination,
      'dir',
    );
  }
}

describe('generated jobs runtime', () => {
  it.each([false, true])(
    'builds and executes generated tests with service Providers selected: %s',
    async (services) => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'create-plugin-jobs-'));
      try {
        await mkdir(path.join(root, 'packages/plugins'), { recursive: true });
        const result = await createPlugin({
          capabilities: services
            ? ['server.jobs', 'server.service-providers']
            : ['server.jobs'],
          name: 'audit-log',
          repoRoot: root,
          install: false,
        });
        await linkDependencies(result.targetDirectory);
        await writeFile(
          path.join(result.targetDirectory, 'vitest.config.ts'),
          `import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';\nexport default createNodeVitestConfig({ test: { include: ['tests/**/*.test.ts'] } });\n`,
        );
        const options = { cwd: result.targetDirectory, timeout: 60_000 };
        await exec(
          process.execPath,
          [
            path.join(packageRoot, 'node_modules/eslint/bin/eslint.js'),
            '.',
            '--max-warnings',
            '0',
          ],
          options,
        );
        // Compile the emitted plugin, not just the generator's renderer. Declaration emit catches public API mistakes.
        await exec(
          process.execPath,
          [
            path.join(packageRoot, 'node_modules/typescript/bin/tsc'),
            '-p',
            'tsconfig.json',
          ],
          options,
        );
        const tests = await exec(
          process.execPath,
          [
            path.join(packageRoot, 'node_modules/vitest/vitest.mjs'),
            'run',
            '--config',
            'vitest.config.ts',
          ],
          options,
        );
        expect(tests.stdout).toContain(services ? '6 passed' : '5 passed');
        const built = await readFile(
          path.join(result.targetDirectory, 'dist/server/plugin.js'),
          'utf8',
        );
        expect(built).not.toContain('queue:');
        expect(built).toContain('serviceProviders');
      } catch (error) {
        if (error && typeof error === 'object' && 'stdout' in error) {
          throw new Error(
            `Generated plugin command failed:\n${String(error.stdout)}\n${'stderr' in error ? String(error.stderr) : ''}`,
            { cause: error },
          );
        }
        throw error;
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
