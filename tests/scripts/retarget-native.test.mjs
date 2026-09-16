import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const templates = [
  'app-template-default',
  'app-template-examples',
  'app-template-hub',
];
const repoRoot = path.resolve(import.meta.dirname, '../..');
const platforms = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'linuxmusl-arm64',
  'linuxmusl-x64',
  'win32-arm64',
  'win32-x64',
];

for (const template of templates) {
  for (const [target, binary] of [
    ['linux-x64', 'linux-x64.node'],
    ['linux-arm64', 'linux-arm64.node'],
    ['linux-x64-musl', 'linuxmusl-x64.node'],
    ['linux-arm64-musl', 'linuxmusl-arm64.node'],
  ]) {
    test(`${template} preserves the bundled binary for ${target}`, async (t) => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), 'nocobase-native-target-'),
      );
      t.after(() => rm(directory, { recursive: true, force: true }));
      const scripts = path.join(directory, 'scripts/utils');
      const packageDir = path.join(
        directory,
        'dist/node_modules/bundled-driver',
      );
      const prebuilds = path.join(packageDir, 'prebuilds');
      await mkdir(scripts, { recursive: true });
      await mkdir(prebuilds, { recursive: true });
      for (const script of ['retarget-native.mjs', 'server-deps.mjs']) {
        await copyFile(
          path.join(
            repoRoot,
            'packages/templates',
            template,
            'scripts/utils',
            script,
          ),
          path.join(scripts, script),
        );
      }
      // better-sqlite3 13 ships these platform filenames together, including distinct glibc and musl builds.
      await writeFile(
        path.join(packageDir, 'package.json'),
        JSON.stringify({ name: 'bundled-driver', version: '1.0.0' }),
      );
      for (const platform of platforms) {
        await writeFile(path.join(prebuilds, `${platform}.node`), platform);
      }

      const result = spawnSync(
        process.execPath,
        [
          path.join(scripts, 'retarget-native.mjs'),
          '--target',
          target,
          '--node-version',
          '24',
        ],
        { encoding: 'utf8' },
      );

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.deepEqual(await readdir(prebuilds), [binary]);
    });
  }
}
