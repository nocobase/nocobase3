import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  OLDER_VERSION,
  parseArgs,
  registerOlderRelease,
} from '../../scripts/smoke-hub-installer.mjs';

test('the smoke script takes a root, a port and the installer command after --', () => {
  const defaults = parseArgs(['--root', '/tmp/hub']);
  assert.equal(defaults.root, path.resolve('/tmp/hub'));
  assert.equal(defaults.port, 13000);
  assert.deepEqual(defaults.installer, [
    'node',
    'packages/tools/hub-installer/bin/run.js',
  ]);

  const custom = parseArgs([
    '--root',
    '/tmp/hub',
    '--port',
    '13200',
    '--',
    'npx',
    '--yes',
    '@nocobase/hub-installer@0.1.0',
  ]);
  assert.equal(custom.port, 13200);
  assert.deepEqual(custom.installer, [
    'npx',
    '--yes',
    '@nocobase/hub-installer@0.1.0',
  ]);

  for (const args of [
    [],
    ['--port', '13000'],
    ['--root', '/tmp/hub', '--port', 'x'],
    ['--root', '/tmp/hub', '--other', 'y'],
    ['--root', '/tmp/hub', '--'],
  ])
    assert.throws(() => parseArgs(args));
});

test('an older release is registered as a copy of the installed one and made current', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-smoke-'));
  try {
    const installed = '1.0.0-beta.37';
    const release = path.join(root, 'releases', installed, 'hub');
    fs.mkdirSync(path.join(release, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(release, 'dist', 'marker'), installed);
    fs.symlinkSync(
      path.join('releases', installed, 'hub'),
      path.join(root, 'current'),
    );
    const buildTarget = { platform: 'linux', arch: 'x64', nodeMajor: 24 };
    fs.writeFileSync(
      path.join(root, 'installer.json'),
      JSON.stringify({
        schemaVersion: 1,
        name: 'nocobase-hub',
        current: installed,
        releases: [
          {
            version: installed,
            installedAt: '2026-09-26T00:00:00.000Z',
            buildTarget,
          },
        ],
        history: [],
      }),
    );

    assert.deepEqual(registerOlderRelease(root), {
      name: 'nocobase-hub',
      upgradeTarget: installed,
    });

    const state = JSON.parse(
      fs.readFileSync(path.join(root, 'installer.json'), 'utf8'),
    );
    assert.equal(state.current, OLDER_VERSION);
    assert.deepEqual(
      state.releases.map((entry) => entry.version),
      [OLDER_VERSION, installed],
    );
    // Older than the installed release, so pruning after the upgrade keeps the right one.
    assert.ok(state.releases[0].installedAt < state.releases[1].installedAt);
    assert.deepEqual(state.releases[0].buildTarget, buildTarget);
    assert.equal(
      fs.readlinkSync(path.join(root, 'current')),
      path.join('releases', OLDER_VERSION, 'hub'),
    );
    assert.equal(
      fs.readFileSync(path.join(root, 'current', 'dist', 'marker'), 'utf8'),
      installed,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
