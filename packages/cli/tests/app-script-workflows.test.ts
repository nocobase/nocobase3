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
const SOURCE_COMMIT = '95b5799ad8c628b73dd79a55a1c37d58b25a2a93';

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
  await writeFakeGit(path.join(bin, 'git'));
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
  it('associates, releases, and deploys an unlinked app with bare deploy', async () => {
    const project = await createUnlinkedProject();
    const fetchMock = firstDeployFetch();
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
    ).toMatchObject({
      applicationId: 'app-1',
      hub: HUB,
      repositoryMode: 'snapshot',
      slug: 'sales',
      sourceCommit: SOURCE_COMMIT,
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
    expect(JSON.parse(String(createUpload?.[1]?.body))).toMatchObject({
      version: '0.0.2',
      sourceCommit: SOURCE_COMMIT,
    });
    const createDeployment = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/api/apps/app-1/deployments') &&
        init?.method === 'POST',
    );
    expect(JSON.parse(String(createDeployment?.[1]?.body))).toEqual({
      targetReleaseId: 'release-1',
      type: 'deploy',
    });
  });

  it('points an app-script status user at the app-script login command', async () => {
    const project = await createUnlinkedProject();
    await mkdir(path.join(project, '.nocobase'));
    await writeFile(
      path.join(project, '.nocobase', 'config.json'),
      `${JSON.stringify({
        applicationId: 'app-1',
        hub: HUB,
        name: 'Sales',
        repositoryMode: 'snapshot',
        slug: 'sales',
        sourceCommit: SOURCE_COMMIT,
      })}\n`,
    );
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
    const project = await createUnlinkedProject();
    await mkdir(path.join(project, '.nocobase'));
    await writeFile(
      path.join(project, '.nocobase', 'config.json'),
      `${JSON.stringify({
        applicationId: 'app-1',
        hub: HUB,
        name: 'Sales',
        repositoryMode: 'snapshot',
        slug: 'sales',
        sourceCommit: SOURCE_COMMIT,
      })}\n`,
    );
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

  it.each([
    [['--app', 'sales'], /--app is only available/u],
    [['--yes'], /--yes is only available/u],
  ] as const)(
    'rejects deployment-only flags in the bare deploy workflow',
    async (extra, message) => {
      const project = await createUnlinkedProject();
      const config = await loadAppScriptTestConfig();

      const failed = await runCommandAllowFailure(config, 'deploy', [
        '--dir',
        project,
        '--hub',
        HUB,
        ...extra,
      ]);

      expect((failed.error as Error).message).toMatch(message);
    },
  );
});

async function createUnlinkedProject(): Promise<string> {
  const project = path.join(root, 'sales');
  await mkdir(path.join(project, 'client'), { recursive: true });
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
  await writeFile(path.join(project, 'client', 'index.ts'), 'export {};\n');
  await writeFile(
    path.join(project, 'dist', 'client', 'index.html'),
    '<main>Sales</main>\n',
  );
  await writeFile(
    path.join(project, 'dist', 'server', 'embedded.js'),
    'export default {};\n',
  );
  return project;
}

function firstDeployFetch(): ReturnType<typeof vi.fn> {
  let releaseVersion = '';
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/apps/sales')) {
      return errorEnvelope(404, 'APPLICATION_NOT_FOUND', 'Not found.');
    }
    if (url.includes('/api/apps?')) {
      return envelope([], 200, { total: 0, limit: 100, offset: 0 });
    }
    if (url.endsWith('/api/apps') && init?.method === 'POST') {
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
    if (url.endsWith('/api/apps/app-1/repository')) {
      return envelope({
        applicationId: 'app-1',
        provider: 'hub',
        cloneUrl: `${HUB}/git/sales.git`,
        defaultBranch: 'main',
        headCommit: SOURCE_COMMIT,
        status: 'ready',
        updatedAt: '2026-08-27T00:00:00.000Z',
      });
    }
    if (url.includes('/api/apps/app-1/releases?')) {
      return envelope([
        {
          id: 'release-initial',
          applicationId: 'app-1',
          version: '0.0.1',
          sourceCommit: 'initial-source',
        },
      ]);
    }
    if (
      url.endsWith('/api/apps/app-1/release-uploads') &&
      init?.method === 'POST'
    ) {
      const body = JSON.parse(String(init.body)) as {
        sourceCommit: string;
        version: string;
      };
      releaseVersion = body.version;
      return envelope(
        {
          id: 'upload-1',
          applicationId: 'app-1',
          status: 'created',
          version: body.version,
          sourceCommit: body.sourceCommit,
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
        sourceCommit: SOURCE_COMMIT,
        release: {
          id: 'release-1',
          applicationId: 'app-1',
          version: releaseVersion,
          sourceCommit: SOURCE_COMMIT,
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
          sourceCommit: SOURCE_COMMIT,
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
      'source:read',
      'source:write',
      'releases:read',
      'releases:publish',
      'deployments:read',
      'deployments:deploy',
    ],
    applicationScope: { mode: 'all-authorized' },
  });
}

async function writeFakeGit(target: string): Promise<void> {
  await writeFile(
    target,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.includes('clone')) {
  fs.mkdirSync(path.join(args.at(-1), '.git'), { recursive: true });
  process.exit(0);
}
if (args[0] === 'rev-parse') {
  process.stdout.write('${SOURCE_COMMIT}\\n');
  process.exit(0);
}
if (args[0] === 'status') process.exit(0);
if (['checkout', 'clean', 'add', 'push'].includes(args[0])) process.exit(0);
process.stderr.write('Unsupported fake git invocation: ' + args.join(' '));
process.exit(2);
`,
    { mode: 0o700 },
  );
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
