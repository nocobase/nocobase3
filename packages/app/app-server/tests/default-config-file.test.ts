import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createConfigPaths,
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
      resolveDefaultAppConfigFile(createConfigPaths({ rootDir: appDir })),
    ).toBe(path.join(appDir, 'config.yml'));
  });

  it('falls back to the file next to dist/ when a built application has none inside it', () => {
    const appDir = createApplicationDir();
    writeFileSync(path.join(appDir, 'config.yaml'), 'name: main\n');

    expect(
      resolveDefaultAppConfigFile(
        createConfigPaths({ rootDir: path.join(appDir, 'dist') }),
      ),
    ).toBe(path.join(appDir, 'config.yaml'));
  });

  it('prefers a config file inside dist/ over the one next to it', () => {
    const appDir = createApplicationDir();
    writeFileSync(path.join(appDir, 'config.yml'), 'name: outer\n');
    writeFileSync(path.join(appDir, 'dist', 'config.yml'), 'name: inner\n');

    expect(
      resolveDefaultAppConfigFile(
        createConfigPaths({ rootDir: path.join(appDir, 'dist') }),
      ),
    ).toBe(path.join(appDir, 'dist', 'config.yml'));
  });

  it('keeps the in-root candidate when no config file exists anywhere', () => {
    const appDir = createApplicationDir();

    expect(
      resolveDefaultAppConfigFile(
        createConfigPaths({ rootDir: path.join(appDir, 'dist') }),
      ),
    ).toBe(path.join(appDir, 'dist', 'config'));
  });

  it('does not look outside a root that is not a dist/ directory', () => {
    const appDir = createApplicationDir();
    const nested = path.join(appDir, 'apps', 'main');
    mkdirSync(nested, { recursive: true });
    writeFileSync(path.join(appDir, 'apps', 'config.yml'), 'name: parent\n');

    expect(
      resolveDefaultAppConfigFile(createConfigPaths({ rootDir: nested })),
    ).toBe(path.join(nested, 'config'));
  });
});
