import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CredentialStore } from '../src/lib/credential-store.ts';
import {
  loadAppScriptTestConfig,
  runCommand,
  runCommandAllowFailure,
} from './helpers.ts';

const HUB = 'https://hub.example.com/hub';

let root: string;
let originalCliRoot: string | undefined;
let originalPath: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'nocobase-app-scripts-'));
  originalCliRoot = process.env.NOCOBASE_CLI_ROOT;
  originalPath = process.env.PATH;
  process.env.NOCOBASE_CLI_ROOT = path.join(root, 'user-data');
  const bin = path.join(root, 'bin');
  await mkdir(bin);
  await writeFakePnpm(path.join(bin, 'pnpm'));
  process.env.PATH = `${bin}${path.delimiter}${originalPath ?? ''}`;
  await saveCredential();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  restoreEnvironment('NOCOBASE_CLI_ROOT', originalCliRoot);
  restoreEnvironment('PATH', originalPath);
  await rm(root, { force: true, recursive: true });
});

describe('application package-script workflows', () => {
  it('creates, binds, releases, and deploys an unlinked app from its build artifact', async () => {
    const project = await createProject();
    const fetchMock = releaseWorkflowFetch({ createApplication: true });
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadAppScriptTestConfig();

    const result = await runCommand(config, 'deploy', [
      '--dir',
      project,
      '--hub',
      HUB,
      '--non-interactive',
      '--json',
      '--operation-id',
      'first-deploy',
    ]);

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      operationId: 'first-deploy',
      application: { id: 'app-1', slug: 'sales' },
      release: { id: 'release-1', version: '0.0.2' },
      deployment: { id: 'deployment-1', status: 'succeeded' },
    });
    expect(
      JSON.parse(
        await readFile(path.join(project, '.nocobase', 'config.json'), 'utf8'),
      ),
    ).toEqual({
      name: '@example/sales',
      hub: HUB,
      applicationId: 'app-1',
      slug: 'sales',
    });

    const createApp = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/api/apps') && init?.method === 'POST',
    );
    expect(JSON.parse(String(createApp?.[1]?.body))).toEqual({
      name: '@example/sales',
      slug: 'sales',
    });
    const createUpload = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/api/apps/app-1/release-uploads') &&
        init?.method === 'POST',
    );
    const uploadBody = JSON.parse(String(createUpload?.[1]?.body));
    expect(Object.keys(uploadBody).sort()).toEqual(
      [
        'archiveChecksum',
        'archiveFormat',
        'archiveSizeBytes',
        'checksum',
        'manifest',
        'sizeBytes',
        'version',
      ].sort(),
    );
    expect(uploadBody.manifest).not.toHaveProperty('source');
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/repository'),
      ),
    ).toBe(false);
  });

  it('binds an existing Hub app explicitly before releasing it', async () => {
    const project = await createProject();
    const fetchMock = releaseWorkflowFetch({ createApplication: false });
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadAppScriptTestConfig();

    const result = await runCommand(config, 'release', [
      '--dir',
      project,
      '--hub',
      HUB,
      '--app',
      'sales',
      '--bump',
      'patch',
      '--non-interactive',
      '--json',
      '--operation-id',
      'bind-existing',
    ]);

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      application: { id: 'app-1', slug: 'sales' },
      release: { id: 'release-1', version: '0.0.2' },
    });
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith('/api/apps') && init?.method === 'POST',
      ),
    ).toBe(false);
    expect(
      JSON.parse(
        await readFile(path.join(project, '.nocobase', 'config.json'), 'utf8'),
      ),
    ).toMatchObject({ applicationId: 'app-1', hub: HUB, slug: 'sales' });
  });

  it.each([
    [
      ['--hub', 'https://other.example.com/hub'],
      /already associated with Hub/u,
    ],
    [['--app', 'billing'], /already associated with application/u],
  ] as const)(
    'rejects an explicit target that conflicts with the saved association',
    async (target, message) => {
      const project = await createProject({ linked: true });
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const config = await loadAppScriptTestConfig();

      const failed = await runCommandAllowFailure(config, 'deploy', [
        '--dir',
        project,
        ...target,
        '--json',
      ]);

      expect(JSON.parse(failed.stdout).error.message).toMatch(message);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('does not silently bind an existing slug when first deployment omits --app', async () => {
    const project = await createProject();
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/apps') && init?.method === 'POST') {
          return errorEnvelope(
            409,
            'APPLICATION_SLUG_CONFLICT',
            'Application slug already exists.',
          );
        }
        throw new Error(`Unexpected request: ${init?.method} ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadAppScriptTestConfig();

    const failed = await runCommandAllowFailure(config, 'deploy', [
      '--dir',
      project,
      '--hub',
      HUB,
      '--non-interactive',
      '--json',
    ]);

    expect(JSON.parse(failed.stdout).error.message).toContain(
      'Pass --app sales to bind it explicitly',
    );
    expect(JSON.parse(failed.stdout).error.hint).toContain('--app sales');
    expect(JSON.parse(failed.stdout).error.hint).not.toContain(
      '--operation-id',
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/api/apps?'),
      ),
    ).toBe(false);
  });

  it('points an app-script status user at the app-script login command', async () => {
    const project = await createProject({ linked: true });
    await new CredentialStore().remove(HUB);
    const config = await loadAppScriptTestConfig();

    const failed = await runCommandAllowFailure(config, 'status', [
      '--dir',
      project,
      '--json',
    ]);

    expect(failed.error).toMatchObject({ oclif: { exit: 3 } });
    expect(JSON.parse(failed.stdout)).toMatchObject({
      error: {
        code: 'NOT_LOGGED_IN',
        hint: expect.stringContaining(`pnpm run hub:login --hub ${HUB}`),
      },
    });
  });

  it('keeps explicit Release deployment on the deployment-only workflow', async () => {
    const project = await createProject({ linked: true });
    const fetchMock = existingReleaseDeployFetch();
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadAppScriptTestConfig();

    const result = await runCommand(config, 'deploy', [
      '--dir',
      project,
      '--release',
      '1.0.0',
      '--non-interactive',
      '--json',
      '--operation-id',
      'deploy-existing',
    ]);

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      operationId: 'deploy-existing',
      release: { id: 'release-existing', version: '1.0.0' },
      deployment: { id: 'deployment-existing', status: 'succeeded' },
    });
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/release-uploads'),
      ),
    ).toBe(false);
  });

  it('rejects --yes when no rollback was requested', async () => {
    const project = await createProject();
    const config = await loadAppScriptTestConfig();

    const failed = await runCommandAllowFailure(config, 'deploy', [
      '--dir',
      project,
      '--hub',
      HUB,
      '--yes',
    ]);

    expect((failed.error as Error).message).toMatch(/--yes is only available/u);
  });
});

async function createProject(
  options: { linked?: boolean } = {},
): Promise<string> {
  const project = path.join(root, `sales-${crypto.randomUUID()}`);
  await mkdir(path.join(project, 'dist', 'client'), { recursive: true });
  await mkdir(path.join(project, 'dist', 'server'), { recursive: true });
  await writeFile(
    path.join(project, 'package.json'),
    `${JSON.stringify({
      name: '@example/sales',
      packageManager: 'pnpm@11.7.0',
      nocobase: { plugins: {} },
      scripts: { build: 'noop' },
    })}\n`,
  );
  await writeFile(
    path.join(project, 'dist', 'client', 'index.html'),
    '<main>Sales</main>\n',
  );
  await writeFile(
    path.join(project, 'dist', 'server', 'embedded.js'),
    'export default {};\n',
  );
  if (options.linked) {
    await mkdir(path.join(project, '.nocobase'));
    await writeFile(
      path.join(project, '.nocobase', 'config.json'),
      `${JSON.stringify({
        applicationId: 'app-1',
        hub: HUB,
        name: '@example/sales',
        slug: 'sales',
        template: '@nocobase/app-template-default',
        templateVersion: '0.0.1',
      })}\n`,
    );
  }
  return project;
}

function releaseWorkflowFetch(options: {
  createApplication: boolean;
}): ReturnType<typeof vi.fn> {
  let releaseVersion = '';
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!options.createApplication && url.endsWith('/api/apps/sales')) {
      return envelope({
        id: 'app-1',
        slug: 'sales',
        name: 'Sales',
        status: 'active',
      });
    }
    if (
      options.createApplication &&
      url.endsWith('/api/apps') &&
      init?.method === 'POST'
    ) {
      return envelope(
        {
          id: 'app-1',
          slug: 'sales',
          name: '@example/sales',
          status: 'active',
        },
        201,
      );
    }
    if (url.includes('/api/apps/app-1/releases?')) {
      return envelope([
        {
          id: 'release-initial',
          applicationId: 'app-1',
          version: '0.0.1',
        },
      ]);
    }
    if (
      url.endsWith('/api/apps/app-1/release-uploads') &&
      init?.method === 'POST'
    ) {
      const body = JSON.parse(String(init.body)) as { version: string };
      releaseVersion = body.version;
      return envelope(
        {
          id: 'upload-1',
          applicationId: 'app-1',
          status: 'created',
          version: body.version,
          upload: {
            method: 'PUT',
            url: `${HUB}/api/release-uploads/upload-1/content`,
            auth: { mode: 'hub-bearer' },
            headers: { 'Content-Type': 'application/gzip' },
          },
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
        version: releaseVersion,
        release: {
          id: 'release-1',
          applicationId: 'app-1',
          version: releaseVersion,
        },
      });
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

function existingReleaseDeployFetch(): ReturnType<typeof vi.fn> {
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
    if (url.includes('/api/apps/app-1/releases?')) {
      return envelope([
        {
          id: 'release-existing',
          applicationId: 'app-1',
          version: '1.0.0',
        },
      ]);
    }
    if (
      url.endsWith('/api/apps/app-1/deployments') &&
      init?.method === 'POST'
    ) {
      return envelope(
        {
          id: 'deployment-existing',
          applicationId: 'app-1',
          targetReleaseId: 'release-existing',
          type: 'deploy',
          status: 'queued',
        },
        202,
      );
    }
    if (url.endsWith('/api/deployments/deployment-existing')) {
      return envelope({
        id: 'deployment-existing',
        applicationId: 'app-1',
        targetReleaseId: 'release-existing',
        type: 'deploy',
        status: 'succeeded',
      });
    }
    throw new Error(`Unexpected request: ${init?.method} ${url}`);
  });
}

async function saveCredential(): Promise<void> {
  await new CredentialStore().set({
    hub: HUB,
    clientId: 'nb3-cli',
    credentialId: 'credential',
    accessToken: 'access',
    accessTokenExpiresAt: Date.now() + 600_000,
    refreshToken: 'refresh',
    refreshTokenExpiresAt: Date.now() + 3_600_000,
    scopes: [
      'apps:create',
      'apps:read',
      'releases:read',
      'releases:publish',
      'deployments:read',
      'deployments:deploy',
    ],
    applicationScope: { mode: 'all-authorized' },
  });
}

async function writeFakePnpm(target: string): Promise<void> {
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
