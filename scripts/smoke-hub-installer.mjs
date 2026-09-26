#!/usr/bin/env node
// Installs, checks, upgrades and rolls back a Hub with hub-installer. CI runs it against the published template with
// the installer from the checkout; `pnpm unreleased:hub-smoke` runs it against the unreleased snapshot. Keeping one
// script keeps the two from drifting apart.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const OLDER_VERSION = '0.0.0-smoke';

const usage = `Usage: node scripts/smoke-hub-installer.mjs --root DIR [--port 13000] [-- INSTALLER...]

Runs install, status, upgrade and rollback against a new Hub at DIR. INSTALLER is the
command that runs hub-installer, "node packages/tools/hub-installer/bin/run.js" by default.
pm2 must be on PATH; set PM2_HOME to keep the test away from your own pm2 processes.`;

export function parseArgs(argv) {
  const separator = argv.indexOf('--');
  const own = separator === -1 ? argv : argv.slice(0, separator);
  const installer =
    separator === -1
      ? ['node', 'packages/tools/hub-installer/bin/run.js']
      : argv.slice(separator + 1);
  const options = { port: 13000, installer };
  for (let i = 0; i < own.length; i++) {
    const key = own[i];
    const value = own[i + 1];
    if (!['--root', '--port'].includes(key) || !value || value.startsWith('--'))
      throw new Error(`Invalid option: ${key}\n\n${usage}`);
    options[key.slice(2)] = value;
    i++;
  }
  if (!options.root) throw new Error(`--root is required.\n\n${usage}`);
  options.root = path.resolve(options.root);
  options.port = Number(options.port);
  if (
    !Number.isInteger(options.port) ||
    options.port < 1 ||
    options.port > 65535
  )
    throw new Error('Invalid --port.');
  if (installer.length === 0)
    throw new Error('The installer command is empty.');
  return options;
}

/**
 * Registers a copy of the installed release as an older version and makes it current.
 *
 * Only the newest Hub template is guaranteed to build (it ships no lockfile), so there is no second version to upgrade
 * from. An upgrade to a version already on disk skips the build and still goes through the whole downtime path — stop,
 * backup, switch, migrate, start — which is what this test is for.
 */
export function registerOlderRelease(root, version = OLDER_VERSION) {
  const stateFile = path.join(root, 'installer.json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const installed = state.releases.find(
    (release) => release.version === state.current,
  );
  fs.cpSync(
    path.join(root, 'releases', state.current),
    path.join(root, 'releases', version),
    {
      recursive: true,
      verbatimSymlinks: true,
    },
  );
  state.releases.unshift({
    ...installed,
    version,
    installedAt: '2000-01-01T00:00:00.000Z',
  });
  const upgradeTarget = state.current;
  state.current = version;
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  const temporary = path.join(root, 'current.smoke.tmp');
  fs.rmSync(temporary, { force: true });
  fs.symlinkSync(path.join('releases', version, 'hub'), temporary);
  fs.renameSync(temporary, path.join(root, 'current'));
  return { name: state.name, upgradeTarget };
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

/**
 * Runs the whole check. `installer` is the command that runs hub-installer; `env` must reach pm2 and a registry that
 * serves the Hub template. Throws on the first failed expectation, leaving the Hub root in place for inspection.
 */
export function runHubSmoke({
  root,
  port,
  installer,
  env = process.env,
  log = console.error,
}) {
  const hub = (args) => {
    const result = spawnSync(
      installer[0],
      [...installer.slice(1), ...args, '--json'],
      {
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    if (result.error)
      fail(`hub-installer ${args[0]} did not run: ${result.error.message}`);
    let envelope;
    try {
      envelope = JSON.parse(result.stdout);
    } catch {
      fail(
        `hub-installer ${args[0]} printed no JSON result (exit ${result.status}).`,
      );
    }
    if (!envelope.ok)
      fail(
        `hub-installer ${args[0]} failed with ${envelope.error.code}: ${envelope.error.message}`,
      );
    return envelope.result;
  };
  const pm2 = (args) => {
    const result = spawnSync('pm2', args, { env, stdio: 'ignore' });
    if (result.error || result.status !== 0)
      fail(`pm2 ${args.join(' ')} failed.`);
  };
  const checkStatus = (expectedCurrent) => {
    const status = hub(['status', '--dir', root, '--offline']);
    assert(status.health.ok, `The Hub does not answer ${status.health.url}.`);
    assert(
      status.process?.status === 'online',
      'The pm2 process is not online.',
    );
    assert(
      status.node.matches,
      'The release was built for another Node major.',
    );
    assert(!status.pending, 'An operation is still recorded as pending.');
    assert(
      status.current === expectedCurrent,
      `The Hub runs ${status.current}, expected ${expectedCurrent}.`,
    );
    return status;
  };

  log('== Install');
  const installed = hub([
    'install',
    root,
    '--port',
    String(port),
    '--origin',
    `http://127.0.0.1:${port}`,
  ]);
  assert(installed.started, 'install did not start the Hub.');

  log('== Check the installed Hub');
  checkStatus(installed.version);
  assert(
    !fs.existsSync(
      path.join(root, 'releases', installed.version, 'hub', 'storage'),
    ),
    'The release directory holds a storage/ directory; HUB_STORAGE_DIR was not applied.',
  );
  assert(
    fs.existsSync(path.join(root, 'storage', 'hub', 'database', 'main.sqlite')),
    'The Hub database is not in the shared storage/ directory.',
  );

  log(`== Upgrade from a copy registered as ${OLDER_VERSION}`);
  const { name, upgradeTarget } = registerOlderRelease(root);
  pm2(['delete', name]);
  pm2(['start', path.join(root, 'ecosystem.config.cjs')]);
  const upgraded = hub([
    'upgrade',
    '--dir',
    root,
    '--to',
    upgradeTarget,
    '--yes',
  ]);
  assert(
    upgraded.upgraded && upgraded.reused,
    'upgrade did not reuse the release on disk.',
  );
  assert(
    upgraded.from === OLDER_VERSION,
    `upgrade started from ${upgraded.from}.`,
  );
  assert(
    fs.existsSync(path.join(root, upgraded.backup, 'main.sqlite')),
    'upgrade took no database backup.',
  );
  checkStatus(upgradeTarget);

  log('== Roll back');
  const rolledBack = hub(['rollback', '--dir', root, '--yes']);
  assert(
    rolledBack.to === OLDER_VERSION,
    `rollback returned to ${rolledBack.to}.`,
  );
  checkStatus(OLDER_VERSION);

  return { root, version: installed.version };
}

if (import.meta.main) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = runHubSmoke(options);
    console.log(
      `Hub installer smoke test passed with ${result.version} at ${result.root}.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
