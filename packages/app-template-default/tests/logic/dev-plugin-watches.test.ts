// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolvePluginWatchIncludes } from '../../scripts/dev-plugin-watches.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('development plugin watches', () => {
  it('watches only enabled plugins registered by the current app and present in the workspace', () => {
    const workspaceDir = createTemporaryWorkspace();
    const appDir = path.join(workspaceDir, 'packages', 'app-template-default');

    writePackageJson(appDir, {
      name: '@nocobase/app-template-default',
      nocobase: {
        plugins: {
          '@nocobase/app-plugin-enabled': { enabled: true },
          '@nocobase/app-plugin-disabled': { enabled: false },
          '@nocobase/app-plugin-external': { enabled: true },
        },
      },
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

    expect(resolvePluginWatchIncludes(appDir)).toEqual([
      '../app-plugin-enabled/package.json',
      '../app-plugin-enabled/database/**/*',
      '../app-plugin-enabled/server/**/*',
    ]);
  });
});

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
