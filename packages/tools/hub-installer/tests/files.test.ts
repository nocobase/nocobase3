import {
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCurrent, switchCurrent } from '../src/lib/current-link.ts';
import { buildEcosystemConfig } from '../src/lib/ecosystem.ts';
import { buildHubEnv, healthUrl, readHubEnv } from '../src/lib/env-file.ts';
import { layoutOf, releaseLinkTarget } from '../src/lib/layout.ts';
import { acquireLock } from '../src/lib/lock.ts';
import {
  readState,
  writeState,
  type InstallerState,
} from '../src/lib/state.ts';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'hub-installer-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('hub.env', () => {
  it('writes absolute config and storage paths, so a release never holds the data', async () => {
    const layout = layoutOf(root);
    await writeFile(
      layout.hubEnv,
      buildHubEnv(layout, {
        origin: 'https://apps.example.com',
        host: '127.0.0.1',
        port: 13000,
      }),
    );
    const env = await readHubEnv(layout);
    expect(env).toMatchObject({
      NODE_ENV: 'production',
      APP_BASE_PATH: '/hub',
      APP_CONFIG_FILE: layout.configFile,
      HUB_STORAGE_DIR: layout.storageDir,
      APP_PUBLIC_ORIGIN: 'https://apps.example.com',
      APP_SERVER_PORT: '13000',
      NOCOBASE_STRICT_STARTUP: 'true',
    });
    expect(path.isAbsolute(env.APP_CONFIG_FILE)).toBe(true);
    expect(path.isAbsolute(env.HUB_STORAGE_DIR)).toBe(true);
  });

  it('quotes a path with spaces so it reads back unchanged', async () => {
    const spaced = path.join(root, 'with space');
    await mkdir(spaced);
    const layout = layoutOf(spaced);
    await writeFile(
      layout.hubEnv,
      buildHubEnv(layout, {
        origin: 'http://127.0.0.1:13000',
        host: '127.0.0.1',
        port: 13000,
      }),
    );
    expect((await readHubEnv(layout)).HUB_STORAGE_DIR).toBe(layout.storageDir);
  });

  it('checks health on loopback when the Hub binds every interface', () => {
    expect(
      healthUrl({ APP_SERVER_HOST: '0.0.0.0', APP_SERVER_PORT: '13001' }),
    ).toBe('http://127.0.0.1:13001/hub/api/healthz');
    expect(
      healthUrl({ APP_SERVER_HOST: '10.0.0.5', APP_SERVER_PORT: '80' }),
    ).toBe('http://10.0.0.5:80/hub/api/healthz');
  });
});

describe('ecosystem.config.cjs', () => {
  it('runs node itself on the real path of the current release', async () => {
    const layout = layoutOf(root);
    const release = path.join(root, releaseLinkTarget('1.0.0'));
    await mkdir(path.join(release, 'dist/server'), { recursive: true });
    await writeFile(path.join(release, 'dist/server/standalone.js'), '');
    await symlink(releaseLinkTarget('1.0.0'), layout.current);
    await writeFile(
      layout.hubEnv,
      buildHubEnv(layout, {
        origin: 'http://127.0.0.1:13000',
        host: '127.0.0.1',
        port: 13000,
      }),
    );
    await writeFile(
      layout.ecosystemFile,
      buildEcosystemConfig({ name: 'nocobase-hub', nodePath: '/usr/bin/node' }),
    );

    const require = createRequire(import.meta.url);
    const config = require(layout.ecosystemFile) as {
      apps: {
        name: string;
        script: string;
        args: string[];
        interpreter: string;
        env: Record<string, string>;
        kill_timeout: number;
        treekill: boolean;
      }[];
    };
    const [app] = config.apps;
    expect(app.name).toBe('nocobase-hub');
    expect(app.script).toBe('/usr/bin/node');
    expect(app.interpreter).toBe('none');
    // realpath, not the link: pm2 keeps this path, so a later switch must go through delete + start.
    expect(app.args).toEqual([
      await import('node:fs').then((fs) =>
        fs.realpathSync(path.join(release, 'dist/server/standalone.js')),
      ),
    ]);
    expect(app.env.HUB_STORAGE_DIR).toBe(layout.storageDir);
    expect(app.kill_timeout).toBeGreaterThanOrEqual(60_000);
    expect(app.treekill).toBe(false);
  });
});

describe('current link', () => {
  it('replaces an existing link in one rename', async () => {
    const layout = layoutOf(root);
    expect(await readCurrent(layout)).toBeUndefined();
    await switchCurrent(layout, releaseLinkTarget('1.0.0'));
    await switchCurrent(layout, releaseLinkTarget('1.1.0'));
    expect(await readlink(layout.current)).toBe(releaseLinkTarget('1.1.0'));
  });
});

describe('installer.json', () => {
  const state: InstallerState = {
    schemaVersion: 1,
    name: 'nocobase-hub',
    registry: 'https://npm.nocobase.ai',
    dialect: 'sqlite',
    drivers: [],
    current: '1.0.0',
    releases: [
      {
        version: '1.0.0',
        installedAt: '2026-01-01T00:00:00.000Z',
        buildTarget: { platform: 'linux', arch: 'x64', nodeMajor: 24 },
      },
    ],
    history: [
      { action: 'install', to: '1.0.0', at: '2026-01-01T00:00:00.000Z' },
    ],
  };

  it('reads back what it wrote', async () => {
    const layout = layoutOf(root);
    await writeState(layout, state);
    expect(await readState(layout)).toEqual(state);
  });

  it('reports a root without installer.json as not installed', async () => {
    await expect(readState(layoutOf(root))).rejects.toMatchObject({
      code: 'NOT_INSTALLED',
      exitCode: 2,
    });
  });

  it('refuses a schema it does not know', async () => {
    const layout = layoutOf(root);
    await writeFile(
      layout.stateFile,
      JSON.stringify({ ...state, schemaVersion: 2 }),
    );
    await expect(readState(layout)).rejects.toMatchObject({
      code: 'STATE_UNSUPPORTED',
    });
  });
});

describe('lock', () => {
  it('lets one installer in and turns the next away', async () => {
    const file = path.join(root, '.installer.lock');
    const release = await acquireLock(file);
    // The lock holds this process's pid, which is alive, so a second attempt from another pid is refused.
    await writeFile(file, `${process.ppid}\n`);
    await expect(acquireLock(file)).rejects.toMatchObject({ code: 'LOCKED' });
    await release();
    await expect(readFile(file, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('takes over a lock whose owner is gone', async () => {
    const file = path.join(root, '.installer.lock');
    // pid 2^22 + 1 is above the default pid_max on Linux and macOS, so no process has it.
    await writeFile(file, `${2 ** 22 + 1}\n`);
    const release = await acquireLock(file);
    expect((await readFile(file, 'utf8')).trim()).toBe(String(process.pid));
    await release();
  });
});
