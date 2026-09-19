// @vitest-environment node

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nocobase-build-cli-'));
  temporaryDirectories.push(root);
  mkdirSync(path.join(root, 'scripts', 'utils'), { recursive: true });
  mkdirSync(path.join(root, 'dist', 'node_modules'), { recursive: true });
  return root;
}

function copyScript(root: string, relativePath: string) {
  copyFileSync(
    path.resolve('scripts', relativePath),
    path.join(root, 'scripts', relativePath),
  );
}

describe('build command help', () => {
  it.each(['--help', '-h'])(
    '%s exits without dependencies, hooks, or changing dist',
    (flag) => {
      const root = createFixture();
      copyScript(root, 'build.mjs');
      const sentinel = path.join(root, 'dist', 'keep.txt');
      writeFileSync(sentinel, 'existing build');
      // Only the entry script is copied: loading build helpers or dependencies would fail.
      const result = spawnSync(
        process.execPath,
        [path.join(root, 'scripts', 'build.mjs'), flag, '--tar'],
        { cwd: root, encoding: 'utf8', timeout: 10_000 },
      );

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Usage: pnpm build [options]');
      for (const option of [
        '--target',
        '--node-version',
        '--tar',
        'nocobase.buildTarget',
      ]) {
        expect(result.stdout).toContain(option);
      }
      expect(readFileSync(sentinel, 'utf8')).toBe('existing build');
      expect(() =>
        readFileSync(path.join(root, 'storage', 'exports', 'dist.tar.gz')),
      ).toThrow();
    },
  );
});

describe('deployment target metadata', () => {
  function retarget(args: string[], hostShim?: string) {
    const root = createFixture();
    copyScript(root, 'utils/retarget-native.mjs');
    copyScript(root, 'utils/server-deps.mjs');
    const manifestPath = path.join(root, 'dist', 'package.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        name: 'fixture-app',
        engines: { node: '>=24.0.0' },
        nocobase: {
          templateKind: 'fixture',
          buildTarget: { platform: 'stale' },
        },
      }),
    );
    const nodeArgs: string[] = [];
    if (hostShim) {
      const shimPath = path.join(root, 'host.mjs');
      writeFileSync(shimPath, hostShim);
      nodeArgs.push('--import', shimPath);
    }
    const result = spawnSync(
      process.execPath,
      [
        ...nodeArgs,
        path.join(root, 'scripts', 'utils', 'retarget-native.mjs'),
        ...args,
      ],
      { cwd: root, encoding: 'utf8', timeout: 10_000 },
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const manifest: {
      name: string;
      engines: { node: string };
      nocobase: {
        templateKind: string;
        buildTarget: {
          platform: string;
          arch: string;
          libc: string;
          nodeMajor: number;
          nodeAbi: number;
        };
      };
    } = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.name).toBe('fixture-app');
    expect(manifest.engines.node).toBe('>=24.0.0');
    expect(manifest.nocobase.templateKind).toBe('fixture');
    return manifest.nocobase.buildTarget;
  }

  it('records an explicit target even when no native modules are installed', () => {
    expect(retarget(['--target', 'linux-x64', '--node-version', '24'])).toEqual(
      {
        platform: 'linux',
        arch: 'x64',
        libc: 'glibc',
        nodeMajor: 24,
        nodeAbi: 137,
      },
    );
  });

  it('records the requested musl target and Node ABI with equals syntax', () => {
    expect(
      retarget(['--target=linux-arm64-musl', '--node-version=26']),
    ).toEqual({
      platform: 'linux',
      arch: 'arm64',
      libc: 'musl',
      nodeMajor: 26,
      nodeAbi: 147,
    });
  });

  it('records the running platform and Node version by default', () => {
    expect(retarget([])).toMatchObject({
      platform: process.platform,
      arch: process.arch,
      nodeMajor: Number(process.versions.node.split('.')[0]),
      nodeAbi: Number(process.versions.modules),
    });
  });

  it.each([
    ['{}', 'musl'],
    ['{ glibcVersionRuntime: "2.36" }', 'glibc'],
  ])(
    'detects the current Linux libc from runtime header %s',
    (header, libc) => {
      const target = retarget(
        [],
        `Object.defineProperty(process, 'platform', { value: 'linux' });
process.report.getReport = () => ({ header: ${header} });`,
      );
      expect(target.platform).toBe('linux');
      expect(target.libc).toBe(libc);
    },
  );
});
