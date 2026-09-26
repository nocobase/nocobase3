import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pendingTaskCount } from '../src/lib/app-cli.ts';
import { waitForHealthy } from '../src/lib/health.ts';
import { parseJlist } from '../src/lib/pm2.ts';
import { resolveTemplateVersion, type FetchLike } from '../src/lib/registry.ts';
import {
  driverSpecifier,
  driversFor,
  installEnv,
  parseCreateResult,
  verifyBuildTarget,
} from '../src/lib/release.ts';

function jsonFetch(body: unknown, status = 200): FetchLike {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('resolveTemplateVersion', () => {
  const packument = {
    'dist-tags': { latest: '1.0.0-beta.37', beta: '1.0.0-beta.37' },
    versions: { '1.0.0-beta.36': {}, '1.0.0-beta.37': {} },
  };

  it('turns a dist-tag into the exact version', async () => {
    await expect(
      resolveTemplateVersion(
        'https://registry.test/',
        'latest',
        jsonFetch(packument),
      ),
    ).resolves.toBe('1.0.0-beta.37');
  });

  it('accepts an exact version the registry has', async () => {
    await expect(
      resolveTemplateVersion(
        'https://registry.test',
        '1.0.0-beta.36',
        jsonFetch(packument),
      ),
    ).resolves.toBe('1.0.0-beta.36');
  });

  it('names the tags and recent versions when the request matches nothing', async () => {
    await expect(
      resolveTemplateVersion(
        'https://registry.test',
        '9.9.9',
        jsonFetch(packument),
      ),
    ).rejects.toMatchObject({ code: 'VERSION_NOT_FOUND', exitCode: 2 });
  });

  it('reports an unreachable registry as a precheck failure', async () => {
    await expect(
      resolveTemplateVersion(
        'https://registry.test',
        'latest',
        jsonFetch({}, 503),
      ),
    ).rejects.toMatchObject({ code: 'REGISTRY_UNREACHABLE', exitCode: 2 });
  });

  it('asks for the scoped package with an encoded slash', async () => {
    let requested = '';
    const fetchImpl: FetchLike = async (url) => {
      requested = url;
      return { ok: true, status: 200, json: async () => packument };
    };
    await resolveTemplateVersion('https://registry.test/', 'latest', fetchImpl);
    expect(requested).toBe(
      'https://registry.test/@nocobase%2fapp-template-hub',
    );
  });
});

describe('create-app result', () => {
  it('reads the last JSON line among pnpm notices', () => {
    const stdout = [
      'Progress: resolved 1, reused 0, downloaded 1, added 1, done',
      '{"status":"success","stage":"complete","nextCommands":[]}',
      '',
    ].join('\n');
    expect(parseCreateResult(stdout)).toMatchObject({
      status: 'success',
      stage: 'complete',
    });
    expect(parseCreateResult('no json here')).toEqual({});
  });
});

describe('drivers', () => {
  it('adds nothing for SQLite and the dialect package otherwise', () => {
    expect(driversFor('sqlite')).toEqual([]);
    expect(driversFor('postgres')).toEqual(['@nocobase/db-postgres']);
  });

  it('pins a driver to the range the installed runtime accepts', async () => {
    const project = await mkdtemp(
      path.join(os.tmpdir(), 'hub-installer-driver-'),
    );
    try {
      const server = path.join(project, 'node_modules/@nocobase/app-server');
      await mkdir(server, { recursive: true });
      await writeFile(
        path.join(server, 'package.json'),
        JSON.stringify({
          peerDependencies: { '@nocobase/db-postgres': '^0.1.0-beta.3' },
        }),
      );
      await expect(
        driverSpecifier(project, '@nocobase/db-postgres'),
      ).resolves.toBe('@nocobase/db-postgres@^0.1.0-beta.3');
      await expect(
        driverSpecifier(project, '@nocobase/db-mysql'),
      ).resolves.toBe('@nocobase/db-mysql');
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it('clears the release-age hold for install steps', () => {
    expect(installEnv({ PATH: '/bin' })).toEqual({
      PATH: '/bin',
      PNPM_CONFIG_MINIMUM_RELEASE_AGE: '0',
    });
  });
});

describe('verifyBuildTarget', () => {
  const here = { platform: 'linux', arch: 'x64', nodeMajor: 24 };

  it('accepts a build for this machine', () => {
    expect(verifyBuildTarget({ ...here, libc: 'glibc' }, here)).toMatchObject(
      here,
    );
  });

  it('rejects another platform or Node major', () => {
    expect(() => verifyBuildTarget({ ...here, nodeMajor: 22 }, here)).toThrow(
      /Node 22/,
    );
    expect(() => verifyBuildTarget({ ...here, arch: 'arm64' }, here)).toThrow(
      /arm64/,
    );
    expect(() => verifyBuildTarget(undefined, here)).toThrow(
      /unknown platform/,
    );
  });
});

describe('pm2 jlist', () => {
  it('skips daemon notices, including ones that start with a bracket', () => {
    const stdout = [
      '[PM2] Spawning PM2 daemon with pm2_home=/home/hub/.pm2',
      '[PM2] PM2 Successfully daemonized',
      JSON.stringify([
        {
          name: 'nocobase-hub',
          pid: 42,
          pm2_env: { status: 'online', restart_time: 3 },
        },
      ]),
    ].join('\n');
    expect(parseJlist(stdout)).toEqual([
      { name: 'nocobase-hub', pid: 42, status: 'online', restarts: 3 },
    ]);
    expect(parseJlist('')).toEqual([]);
  });
});

describe('db apply --dry-run', () => {
  it('counts pending tasks from the plan, not from the status', () => {
    expect(
      pendingTaskCount({
        ok: true,
        status: 'success-noop',
        result: {
          plan: [
            { connection: 'main', kind: 'migrations', tasks: [{}, {}] },
            { connection: 'main', kind: 'seeds', tasks: [{}] },
          ],
        },
      }),
    ).toBe(3);
    expect(pendingTaskCount({ ok: true, result: { plan: [] } })).toBe(0);
  });
});

describe('waitForHealthy', () => {
  it('keeps polling until the Hub answers ok', async () => {
    const answers = [false, false, true];
    const fetchImpl: FetchLike = async () => {
      const ok = answers.shift() ?? true;
      return { ok: true, status: 200, json: async () => ({ ok }) };
    };
    let clock = 0;
    await expect(
      waitForHealthy('http://127.0.0.1/hub/api/healthz', {
        timeoutMs: 10_000,
        fetchImpl,
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
      }),
    ).resolves.toBe(true);
  });

  it('gives up at the timeout', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('ECONNREFUSED');
    };
    let clock = 0;
    await expect(
      waitForHealthy('http://127.0.0.1/hub/api/healthz', {
        timeoutMs: 3_000,
        fetchImpl,
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
      }),
    ).resolves.toBe(false);
  });
});
