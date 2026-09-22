// @vitest-environment node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { resolvePluginWatchIncludes } from '../src/scripts/dev/plugin-watches.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('development plugin watches', () => {
  it('watches only enabled plugins registered by the current app and present in the workspace', async () => {
    const workspaceDir = createTemporaryWorkspace();
    const appDir = path.join(workspaceDir, 'packages', 'app-template-default');

    writePackageJson(appDir, {
      name: '@nocobase/app-template-default',
    });
    writePackageJson(
      path.join(workspaceDir, 'packages', 'app-plugin-enabled'),
      { name: '@nocobase/app-plugin-enabled' },
    );
    writePackageJson(
      path.join(workspaceDir, 'packages', 'app-plugin-disabled'),
      { name: '@nocobase/app-plugin-disabled' },
    );
    writePackageJson(
      path.join(workspaceDir, 'packages', 'app-plugin-unregistered'),
      { name: '@nocobase/app-plugin-unregistered' },
    );

    fs.mkdirSync(path.join(appDir, 'server'), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, 'server/plugins.ts'),
      `
      import enabled from '@nocobase/app-plugin-enabled/server';
      import disabled from '@nocobase/app-plugin-disabled/server';
      import external from '@nocobase/app-plugin-external/server';
      export default defineServerPlugins([enabled, external]);
    `,
    );
    expect(await resolvePluginWatchIncludes(appDir)).toEqual([
      '../app-plugin-enabled/package.json',
      '../app-plugin-enabled/database/**/*',
      '../app-plugin-enabled/server/**/*',
    ]);
  });

  it('watches nothing when every registered plugin comes from node_modules', async () => {
    const appDir = createGeneratedApplication();

    expect(await resolvePluginWatchIncludes(appDir)).toEqual([]);
  });

  it('answers a generated application without loading the TypeScript compiler', () => {
    // The compiler is 24 MB and an unguarded module-level import makes every `pnpm dev` pay for it, including the
    // runs answered with `[]`. Asserting the guard itself is what keeps the import from drifting back to the top of
    // the module, where nothing about the returned value would change. It runs in a child process because the other
    // tests in this file do load the compiler, into a module cache they all share.
    const appDir = createGeneratedApplication();
    const moduleUrl = pathToFileURL(
      path.resolve(
        import.meta.dirname,
        '../src/scripts/dev/plugin-watches.mjs',
      ),
    ).href;
    const probe = `
      import { createRequire } from 'node:module';
      const { resolvePluginWatchIncludes } = await import(${JSON.stringify(moduleUrl)});
      await resolvePluginWatchIncludes(${JSON.stringify(appDir)});
      const cache = createRequire(import.meta.url).cache;
      console.log(
        Object.keys(cache).some((entry) => entry.includes('${path.sep}typescript${path.sep}')),
      );
    `;
    const output = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', probe],
      {
        cwd: path.resolve(import.meta.dirname, '..'),
        encoding: 'utf8',
      },
    );

    expect(output.trim()).toBe('false');
  });

  it('finds plugins grouped one directory below the packages root', async () => {
    const workspaceDir = createTemporaryWorkspace();
    const appDir = path.join(
      workspaceDir,
      'packages',
      'templates',
      'app-template-default',
    );

    writePackageJson(appDir, {
      name: '@nocobase/app-template-default',
    });
    writePackageJson(
      path.join(workspaceDir, 'packages', 'plugins', 'app-plugin-enabled'),
      { name: '@nocobase/app-plugin-enabled' },
    );
    writePackageJson(
      path.join(workspaceDir, 'packages', 'plugins', 'app-plugin-disabled'),
      { name: '@nocobase/app-plugin-disabled' },
    );

    fs.mkdirSync(path.join(appDir, 'server'), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, 'server/plugins.ts'),
      `
      import enabled from '@nocobase/app-plugin-enabled/server';
      import disabled from '@nocobase/app-plugin-disabled/server';
      import external from '@nocobase/app-plugin-external/server';
      export default defineServerPlugins([enabled, external]);
    `,
    );
    expect(await resolvePluginWatchIncludes(appDir)).toEqual([
      '../../plugins/app-plugin-enabled/package.json',
      '../../plugins/app-plugin-enabled/database/**/*',
      '../../plugins/app-plugin-enabled/server/**/*',
    ]);
  });
});

// A generated application registers plugins it installed, so no directory beside it holds their sources.
function createGeneratedApplication(): string {
  const workspaceDir = createTemporaryWorkspace();
  const appDir = path.join(workspaceDir, 'packages', 'app-template-default');

  writePackageJson(appDir, { name: '@nocobase/app-template-default' });
  writePackageJson(path.join(workspaceDir, 'packages', 'unrelated-project'), {
    name: 'unrelated-project',
  });

  fs.mkdirSync(path.join(appDir, 'server'), { recursive: true });
  fs.writeFileSync(
    path.join(appDir, 'server/plugins.ts'),
    `
    import installed from '@nocobase/app-plugin-external/server';
    export default defineServerPlugins([installed]);
  `,
  );

  return appDir;
}

function createTemporaryWorkspace(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'nocobase-app-dev-watch-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function writePackageJson(
  directory: string,
  packageJson: Record<string, unknown>,
): void {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
}
