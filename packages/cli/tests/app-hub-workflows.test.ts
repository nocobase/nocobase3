import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CredentialStore } from '../src/lib/credential-store.ts';
import { loadOperation } from '../src/lib/operation-store.ts';
import {
  loadTestConfig,
  runCommand,
  runCommandAllowFailure,
} from './helpers.ts';

const HUB = 'https://hub.example.com/hub';

let root: string;
let originalRoot: string | undefined;
let originalPath: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'nb3-app-workflows-'));
  originalRoot = process.env.NB3_CLI_ROOT;
  originalPath = process.env.PATH;
  process.env.NB3_CLI_ROOT = path.join(root, 'user-data');
  const bin = path.join(root, 'bin');
  await mkdir(bin);
  await writeFakePackageManager(path.join(bin, 'pnpm'));
  process.env.PATH = `${bin}${path.delimiter}${originalPath ?? ''}`;
  await saveCredential();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  restoreEnvironment('NB3_CLI_ROOT', originalRoot);
  restoreEnvironment('PATH', originalPath);
  await rm(root, { recursive: true, force: true });
});

describe('nb3 Hub artifact workflows', () => {
  it('publishes a local build through a resumable Release upload', async () => {
    const project = await createProject();
    const fetchMock = releaseWorkflowFetch();
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadTestConfig();

    const result = await runCommand(config, 'app:publish', [
      '--dir',
      project,
      '--version',
      '1.0.0',
      '--non-interactive',
      '--json',
      '--operation-id',
      'publish-sales',
    ]);

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      operationId: 'publish-sales',
      application: { id: 'app-1', slug: 'sales' },
      release: { id: 'release-1', version: '1.0.0' },
    });
    const post = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/api/apps/app-1/release-uploads') &&
        init?.method === 'POST',
    );
    expect(JSON.parse(String(post?.[1]?.body))).not.toHaveProperty(
      'sourceCommit',
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/repository'),
      ),
    ).toBe(false);

    const resumed = await runCommand(config, 'app:publish', [
      '--dir',
      project,
      '--version',
      '1.0.0',
      '--non-interactive',
      '--json',
      '--operation-id',
      'publish-sales',
    ]);
    expect(JSON.parse(resumed.stdout)).toMatchObject({
      ok: true,
      release: { id: 'release-1', version: '1.0.0' },
    });
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith('/api/apps/app-1/release-uploads') &&
          init?.method === 'POST',
      ),
    ).toHaveLength(1);
  });

  it('preserves a created Release and Deployment when polling fails', async () => {
    const project = await createProject();
    const releaseFetch = releaseWorkflowFetch();
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (
          url.endsWith('/api/apps/app-1/deployments') &&
          init?.method === 'POST'
        ) {
          return envelope(
            {
              id: 'deployment-1',
              applicationId: 'app-1',
              targetReleaseId: 'release-1',
              type: 'deploy',
              status: 'queued',
            },
            202,
          );
        }
        if (url.endsWith('/api/deployments/deployment-1')) {
          return errorEnvelope(403, 'FORBIDDEN', 'Deployment access denied.');
        }
        return releaseFetch(input, init);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadTestConfig();

    const failed = await runCommandAllowFailure(config, 'app:publish', [
      '--dir',
      project,
      '--version',
      '1.0.0',
      '--deploy',
      '--non-interactive',
      '--json',
      '--operation-id',
      'publish-deploy-failure',
    ]);

    expect(failed.error).toMatchObject({ oclif: { exit: 4 } });
    expect(JSON.parse(failed.stdout)).toMatchObject({
      release: { id: 'release-1', version: '1.0.0' },
      deployment: { id: 'deployment-1', status: 'queued' },
    });
  });

  it('requires the read scopes used by bump and deployment polling', async () => {
    const project = await createProject();
    await saveCredentialWithScopes([
      'apps:read',
      'releases:publish',
      'deployments:deploy',
    ]);
    const config = await loadTestConfig();

    const failed = await runCommandAllowFailure(config, 'app:publish', [
      '--dir',
      project,
      '--bump',
      'patch',
      '--deploy',
      '--dry-run',
      '--non-interactive',
      '--json',
    ]);

    expect(failed.error).toMatchObject({ oclif: { exit: 4 } });
    const output = JSON.parse(failed.stdout);
    expect(output.error.message).toContain('releases:read');
    expect(output.error.message).toContain('deployments:read');
  });

  it('does not resume a publish operation with different flags', async () => {
    const project = await createProject();
    vi.stubGlobal('fetch', applicationFetch());
    const config = await loadTestConfig();

    await runCommand(config, 'app:publish', [
      '--dir',
      project,
      '--version',
      '1.0.0',
      '--dry-run',
      '--non-interactive',
      '--json',
      '--operation-id',
      'publish-plan',
    ]);
    expect(await loadOperation('publish-plan')).toMatchObject({
      parameters: {
        app: 'none',
        bump: 'none',
        deploy: 'false',
        dryRun: 'true',
        version: '1.0.0',
      },
    });

    const failed = await runCommandAllowFailure(config, 'app:publish', [
      '--dir',
      project,
      '--version',
      '1.0.0',
      '--deploy',
      '--dry-run',
      '--non-interactive',
      '--json',
      '--operation-id',
      'publish-plan',
    ]);

    expect(failed.error).toMatchObject({ oclif: { exit: 2 } });
    expect(JSON.parse(failed.stdout).error.message).toContain(
      'different command parameters',
    );
  });

  it('previews a deployment without creating it and reports status without a repository', async () => {
    const project = await createProject();
    const calls: Array<{ method: string; url: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({ method: init?.method ?? 'GET', url });
        if (url.includes('/api/apps/app-1/releases')) {
          return envelope([
            { id: 'release-1', applicationId: 'app-1', version: '1.0.0' },
          ]);
        }
        if (url.endsWith('/api/apps/app-1/deployments?limit=20&offset=0')) {
          return envelope([]);
        }
        if (url.endsWith('/api/apps/app-1')) {
          return envelope({
            id: 'app-1',
            slug: 'sales',
            name: 'Sales',
            status: 'active',
            activeRelease: null,
            runtime: { state: 'stopped', health: 'unknown' },
            links: { open: null },
          });
        }
        throw new Error(`Unexpected request: ${init?.method} ${url}`);
      }),
    );
    const config = await loadTestConfig();

    const preview = await runCommand(config, 'app:deploy', [
      '--dir',
      project,
      '--release',
      '1.0.0',
      '--dry-run',
      '--non-interactive',
      '--json',
      '--operation-id',
      'deploy-sales',
    ]);
    expect(JSON.parse(preview.stdout)).toMatchObject({
      ok: true,
      dryRun: true,
      release: { id: 'release-1', version: '1.0.0' },
    });
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    const status = await runCommand(config, 'app:status', [
      '--dir',
      project,
      '--json',
    ]);
    expect(JSON.parse(status.stdout)).toMatchObject({
      ok: true,
      application: { id: 'app-1', slug: 'sales' },
      releases: [{ id: 'release-1', version: '1.0.0' }],
      deployments: [],
    });
    expect(JSON.parse(status.stdout)).not.toHaveProperty('repository');
  });

  it('deploys a selected Release idempotently and waits for success', async () => {
    const project = await createProject();
    const fetchMock = deploymentWorkflowFetch();
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadTestConfig();
    const result = await runCommand(config, 'app:deploy', [
      '--dir',
      project,
      '--release',
      '1.0.0',
      '--non-interactive',
      '--json',
      '--operation-id',
      'deploy-release',
    ]);

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      deployment: { id: 'deployment-1', status: 'succeeded' },
    });
    expect(
      await loadOperation('deploy-release', {
        root: process.env.NB3_CLI_ROOT,
      }),
    ).toMatchObject({
      kind: 'app-deploy',
      deployment: { id: 'deployment-1', status: 'succeeded' },
    });
  });

  it('requires explicit approval for a non-interactive rollback', async () => {
    const project = await createProject();
    const fetchMock = deploymentWorkflowFetch();
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadTestConfig();

    await expect(
      runCommand(config, 'app:deploy', [
        '--dir',
        project,
        '--release',
        '1.0.0',
        '--rollback',
        '--non-interactive',
        '--json',
      ]),
    ).rejects.toMatchObject({ oclif: { exit: 2 } });
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST'),
    ).toBe(false);
  });
});

async function createProject(): Promise<string> {
  const project = path.join(root, `project-${crypto.randomUUID()}`);
  await mkdir(path.join(project, '.nocobase'), { recursive: true });
  await mkdir(path.join(project, 'dist/client'), { recursive: true });
  await mkdir(path.join(project, 'dist/server'), { recursive: true });
  await writeFile(
    path.join(project, '.nocobase/config.json'),
    `${JSON.stringify({
      applicationId: 'app-1',
      hub: HUB,
      name: 'Sales',
      slug: 'sales',
    })}\n`,
  );
  await writeFile(
    path.join(project, 'package.json'),
    `${JSON.stringify({
      name: 'sales',
      packageManager: 'pnpm@11.7.0',
      scripts: { build: 'noop' },
    })}\n`,
  );
  await writeFile(
    path.join(project, 'dist/client/index.html'),
    '<main>Sales</main>\n',
  );
  await writeFile(
    path.join(project, 'dist/server/embedded.js'),
    'export default {};\n',
  );
  return project;
}

function applicationFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/apps/app-1')) {
      return envelope({
        id: 'app-1',
        slug: 'sales',
        name: 'Sales',
        status: 'active',
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

function releaseWorkflowFetch(): ReturnType<typeof vi.fn> {
  let uploadPosts = 0;
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/apps/app-1')) {
      return envelope({
        id: 'app-1',
        slug: 'sales',
        name: 'Sales',
        status: 'active',
      });
    }
    if (url.endsWith('/api/apps/app-1/release-uploads')) {
      uploadPosts += 1;
      const body = JSON.parse(String(init?.body));
      return envelope(
        {
          id: 'upload-1',
          applicationId: 'app-1',
          status: uploadPosts === 1 ? 'created' : 'completed',
          version: body.version,
          upload: {
            method: 'PUT',
            url: `${HUB}/api/release-uploads/upload-1/content`,
            auth: { mode: 'hub-bearer' },
          },
          ...(uploadPosts === 1
            ? {}
            : { release: { id: 'release-1', version: body.version } }),
        },
        201,
      );
    }
    if (url.endsWith('/api/release-uploads/upload-1/content')) {
      return new Response(null, { status: 204 });
    }
    if (url.endsWith('/api/release-uploads/upload-1/complete')) {
      return envelope({ id: 'upload-1', status: 'verifying' }, 202);
    }
    if (url.endsWith('/api/release-uploads/upload-1')) {
      return envelope({
        id: 'upload-1',
        applicationId: 'app-1',
        status: 'completed',
        version: '1.0.0',
        release: { id: 'release-1', applicationId: 'app-1', version: '1.0.0' },
      });
    }
    throw new Error(`Unexpected request: ${init?.method} ${url}`);
  });
}

function deploymentWorkflowFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/apps/app-1')) {
      return envelope({
        id: 'app-1',
        slug: 'sales',
        name: 'Sales',
        status: 'active',
        activeRelease: null,
      });
    }
    if (url.includes('/api/apps/app-1/releases')) {
      return envelope([
        { id: 'release-1', applicationId: 'app-1', version: '1.0.0' },
      ]);
    }
    if (
      url.endsWith('/api/apps/app-1/deployments') &&
      init?.method === 'POST'
    ) {
      return envelope(
        {
          id: 'deployment-1',
          applicationId: 'app-1',
          targetReleaseId: 'release-1',
          type: 'deploy',
          status: 'queued',
        },
        202,
      );
    }
    if (url.endsWith('/api/deployments/deployment-1')) {
      return envelope({
        id: 'deployment-1',
        applicationId: 'app-1',
        targetReleaseId: 'release-1',
        type: 'deploy',
        status: 'succeeded',
      });
    }
    throw new Error(`Unexpected request: ${init?.method} ${url}`);
  });
}

async function saveCredential(): Promise<void> {
  return saveCredentialWithScopes([
    'profile',
    'apps:create',
    'apps:read',
    'releases:read',
    'releases:publish',
    'deployments:read',
    'deployments:deploy',
    'deployments:rollback',
    'deployments:redeploy',
    'runtime:read',
  ]);
}

async function saveCredentialWithScopes(
  scopes: import('../src/lib/hub-client.ts').AgentScope[],
): Promise<void> {
  await new CredentialStore().set({
    hub: HUB,
    clientId: 'nb3-cli',
    credentialId: 'credential',
    accessToken: 'access',
    accessTokenExpiresAt: Date.now() + 600_000,
    refreshToken: 'refresh',
    refreshTokenExpiresAt: Date.now() + 3_600_000,
    scopes,
    applicationScope: { mode: 'all-authorized' },
  });
}

async function writeFakePackageManager(target: string): Promise<void> {
  await writeFile(target, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
}

function envelope(
  data: unknown,
  status: number = 200,
  meta: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ data, meta, requestId: 'req-1' }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function errorEnvelope(
  status: number,
  code: string,
  message: string,
): Response {
  return new Response(
    JSON.stringify({ error: { code, message }, requestId: 'req-1' }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
