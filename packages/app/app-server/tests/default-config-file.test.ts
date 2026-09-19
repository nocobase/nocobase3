import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createAppPaths,
  resolveDefaultAppConfigFile,
} from '../src/config/index.js';

const tempDirs: string[] = [];

function createApplicationDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'nocobase-config-file-'));
  tempDirs.push(directory);
  mkdirSync(path.join(directory, 'dist', 'server'), { recursive: true });
  return directory;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('default application config file', () => {
  it('reads config.yml from the application root of a source checkout', () => {
    const appDir = createApplicationDir();
    writeFileSync(path.join(appDir, 'config.yml'), 'name: main\n');

    expect(
      resolveDefaultAppConfigFile(createAppPaths({ rootDir: appDir })),
    ).toBe(path.join(appDir, 'config.yml'));
  });

  it('reads configuration from the explicit deployment root', () => {
    const appDir = createApplicationDir();
    writeFileSync(path.join(appDir, 'config.yaml'), 'name: main\n');

    expect(
      resolveDefaultAppConfigFile(
        createAppPaths({
          rootDir: path.join(appDir, 'dist'),
          deploymentRootDir: '..',
        }),
      ),
    ).toBe(path.join(appDir, 'config.yaml'));
  });

  it('ignores a code-directory config when the deployment root is explicit', () => {
    const appDir = createApplicationDir();
    writeFileSync(path.join(appDir, 'config.yml'), 'name: outer\n');
    writeFileSync(path.join(appDir, 'dist', 'config.yml'), 'name: inner\n');

    expect(
      resolveDefaultAppConfigFile(
        createAppPaths({
          rootDir: path.join(appDir, 'dist'),
          deploymentRootDir: '..',
        }),
      ),
    ).toBe(path.join(appDir, 'config.yml'));
  });

  it('uses the deployment root when the configuration does not exist', () => {
    const appDir = createApplicationDir();

    expect(
      resolveDefaultAppConfigFile(
        createAppPaths({
          rootDir: path.join(appDir, 'dist'),
          deploymentRootDir: '..',
        }),
      ),
    ).toBe(path.join(appDir, 'config'));
  });

  it('does not look outside a root that is not a dist/ directory', () => {
    const appDir = createApplicationDir();
    const nested = path.join(appDir, 'apps', 'main');
    mkdirSync(nested, { recursive: true });
    writeFileSync(path.join(appDir, 'apps', 'config.yml'), 'name: parent\n');

    expect(
      resolveDefaultAppConfigFile(createAppPaths({ rootDir: nested })),
    ).toBe(path.join(nested, 'config'));
  });
});
