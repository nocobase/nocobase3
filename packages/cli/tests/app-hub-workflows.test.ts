import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CredentialStore } from '../src/lib/credential-store.ts';
import { createOperation, loadOperation } from '../src/lib/operation-store.ts';
import {
  loadTestConfig,
  runCommand,
  runCommandAllowFailure,
} from './helpers.ts';

const HUB = 'https://hub.example.com/hub';
const COMMIT = '95b5799ad8c628b73dd79a55a1c37d58b25a2a93';
let root: string;
let originalRoot: string | undefined;
let originalPath: string | undefined;
let originalBuildSecret: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'nb3-app-workflows-'));
  originalRoot = process.env.NB3_CLI_ROOT;
  originalPath = process.env.PATH;
  originalBuildSecret = process.env.NB3_TEST_SECRET;
  process.env.NB3_CLI_ROOT = path.join(root, 'user-data');
  process.env.NB3_TEST_SECRET = 'must-not-reach-build';
  const bin = path.join(root, 'bin');
  await mkdir(bin);
  await writeFakeGit(path.join(bin, 'git'));
  await writeFakePackageManager(path.join(bin, 'pnpm'));
  process.env.PATH = `${bin}${path.delimiter}${originalPath ?? ''}`;
  await saveCredential();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  restoreEnvironment('NB3_CLI_ROOT', originalRoot);
  restoreEnvironment('PATH', originalPath);
  restoreEnvironment('NB3_TEST_SECRET', originalBuildSecret);
  await rm(root, { recursive: true, force: true });
});

describe('nb3 Hub application workflows', () => {
  it('creates a Hub application idempotently and clones its authoritative source', async () => {
    const destination = path.join(root, 'sales');
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/apps') && init?.method === 'POST') {
          return envelope(
            { id: 'app-1', slug: 'sales', name: 'Sales CRM', status: 'active' },
            201,
          );
        }
        if (url.endsWith('/api/apps/app-1/repository')) {
          return envelope(repository());
        }
        throw new Error(`Unexpected request: ${init?.method} ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadTestConfig();
    const result = await runCommand(config, 'app:create', [
      'sales',
      '--display-name',
      'Sales CRM',
      '--description',
      'Customer operations',
      '--hub',
      HUB,
      '--dir',
      destination,
      '--non-interactive',
      '--json',
      '--operation-id',
      'create-sales',
    ]);

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      operationId: 'create-sales',
      application: { id: 'app-1', slug: 'sales' },
      directory: destination,
    });
    const post = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/api/apps') && init?.method === 'POST',
    );
    expect(post?.[1]?.headers).toMatchObject({
      'idempotency-key': 'create-sales',
    });
    expect(
      JSON.parse(
        await readFile(path.join(destination, '.nocobase/config.json'), 'utf8'),
      ),
    ).toMatchObject({
      applicationId: 'app-1',
      hub: HUB,
      slug: 'sales',
    });
  });

  it('keeps the created APP but removes a failed clone and suggests pull', async () => {
    const destination = path.join(root, 'clone failure');
    const failedGit = path.join(root, 'failed-git');
    await writeFile(
      failedGit,
      `#!/bin/sh
for destination do :; done
mkdir -p "$destination/.git"
printf partial > "$destination/partial"
exit 9
`,
      { mode: 0o700 },
    );
    const currentPath = process.env.PATH;
    const shimDirectory = path.join(root, 'failed-bin');
    await mkdir(shimDirectory);
    await (
      await import('node:fs/promises')
    ).symlink(failedGit, path.join(shimDirectory, 'git'));
    process.env.PATH = `${shimDirectory}${path.delimiter}${currentPath ?? ''}`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/apps') && init?.method === 'POST') {
          return envelope(
            { id: 'app-1', slug: 'sales', name: 'Sales', status: 'active' },
            201,
          );
        }
        if (url.endsWith('/api/apps/app-1/repository'))
          return envelope(repository());
        throw new Error(`Unexpected request: ${init?.method} ${url}`);
      }),
    );
    const config = await loadTestConfig();

    const failed = await runCommandAllowFailure(config, 'app:create', [
      'sales',
      '--hub',
      HUB,
      '--dir',
      destination,
      '--non-interactive',
      '--json',
      '--operation-id',
      'create-clone-failure',
    ]);

    expect(failed.error).toMatchObject({ oclif: { exit: 6 } });
    expect(JSON.parse(failed.stdout)).toMatchObject({
      ok: false,
      application: { id: 'app-1', slug: 'sales' },
      error: {
        hint: expect.stringContaining(
          `nb3 app pull sales '${destination}' --hub ${HUB}`,
        ),
      },
    });
    await expect(stat(destination)).rejects.toMatchObject({ code: 'ENOENT' });

    const changed = await runCommandAllowFailure(config, 'app:create', [
      'billing',
      '--hub',
      HUB,
      '--dir',
      destination,
      '--non-interactive',
      '--json',
      '--operation-id',
      'create-clone-failure',
    ]);
    expect(changed.error).toMatchObject({ oclif: { exit: 2 } });
    expect(JSON.parse(changed.stdout).error.message).toContain(
      'different command parameters',
    );
  });

  it('publishes a clean commit through a resumable Release upload', async () => {
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
      release: { id: 'release-1', version: '1.0.0', sourceCommit: COMMIT },
    });
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith('/api/apps/app-1/release-uploads') &&
          init?.method === 'POST',
      ),
    ).toBe(true);

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
      operationId: 'publish-sales',
      release: { id: 'release-1', version: '1.0.0' },
    });
    const buildInvocations = (
      await readFile(
        path.join(process.env.NB3_CLI_ROOT!, 'build-invocations.jsonl'),
        'utf8',
      )
    )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(buildInvocations).toEqual([
      {
        appBasePath: '/sales',
        browserBasePath: '/sales',
        secretVisible: false,
      },
    ]);
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith('/api/apps/app-1/release-uploads') &&
          init?.method === 'POST',
      ),
    ).toHaveLength(1);

    const changed = await runCommandAllowFailure(config, 'app:publish', [
      '--dir',
      project,
      '--version',
      '2.0.0',
      '--non-interactive',
      '--json',
      '--operation-id',
      'publish-sales',
    ]);
    expect(changed.error).toMatchObject({ oclif: { exit: 2 } });
    expect(JSON.parse(changed.stdout).error.message).toContain(
      'different command parameters',
    );
  });

  it('does not rebuild a pushed operation from a dirty worktree', async () => {
    const project = await createProject();
    await createOperation({
      kind: 'app-publish',
      operationId: 'publish-dirty-resume',
      hubUrl: HUB,
      idempotencyKey: 'publish-dirty-resume',
      parameters: {
        bump: 'none',
        deploy: 'false',
        dryRun: 'false',
        version: '1.0.0',
      },
      step: 'pushed',
      resourceIds: { applicationId: 'app-1', pushedCommit: COMMIT },
    });
    await writeFile(
      path.join(root, 'bin', 'git'),
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'rev-parse') { process.stdout.write('${COMMIT}\\n'); process.exit(0); }
if (args[0] === 'status') { process.stdout.write(' M tracked.ts\\n'); process.exit(0); }
process.exit(0);
`,
      { mode: 0o700 },
    );
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/apps/app-1')) {
        return envelope({
          id: 'app-1',
          slug: 'sales',
          name: 'Sales',
          status: 'active',
        });
      }
      if (url.endsWith('/api/apps/app-1/repository'))
        return envelope(repository());
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadTestConfig();

    const failed = await runCommandAllowFailure(config, 'app:publish', [
      '--dir',
      project,
      '--version',
      '1.0.0',
      '--non-interactive',
      '--json',
      '--operation-id',
      'publish-dirty-resume',
    ]);

    expect(failed.error).toMatchObject({ oclif: { exit: 2 } });
    expect(JSON.parse(failed.stdout).error.message).toContain(
      'uncommitted changes',
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/release-uploads'),
      ),
    ).toBe(false);
  });

  it('preserves a published Release and created Deployment when polling fails', async () => {
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
          return new Response(
            JSON.stringify({
              error: {
                code: 'FORBIDDEN',
                message: 'Deployment access denied.',
              },
              requestId: 'req-deploy',
            }),
            { status: 403, headers: { 'content-type': 'application/json' } },
          );
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
      ok: false,
      operationId: 'publish-deploy-failure',
      release: { id: 'release-1', version: '1.0.0' },
      deployment: { id: 'deployment-1', status: 'queued' },
      error: {
        code: 'FORBIDDEN',
        hint: expect.stringMatching(
          /nb3 app publish .*--version 1\.0\.0 .*--deploy .*--operation-id publish-deploy-failure/,
        ),
      },
    });
    expect(
      await loadOperation('publish-deploy-failure', {
        root: process.env.NB3_CLI_ROOT,
      }),
    ).toMatchObject({
      kind: 'app-publish',
      resourceIds: {
        releaseId: 'release-1',
        deploymentId: 'deployment-1',
      },
      step: 'deployment-created',
    });
  });

  it('refreshes once after a Release version conflict and suggests a new operation', async () => {
    const project = await createProject();
    let releaseReads = 0;
    let uploadPosts = 0;
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/apps/app-1')) {
          return envelope({
            id: 'app-1',
            slug: 'sales',
            name: 'Sales',
            status: 'active',
          });
        }
        if (url.endsWith('/api/apps/app-1/repository'))
          return envelope(repository());
        if (url.includes('/api/apps/app-1/releases')) {
          releaseReads += 1;
          return envelope(
            releaseReads === 1
              ? [{ id: 'release-1', applicationId: 'app-1', version: '1.0.0' }]
              : [
                  { id: 'release-1', applicationId: 'app-1', version: '1.0.0' },
                  { id: 'release-2', applicationId: 'app-1', version: '1.0.1' },
                ],
          );
        }
        if (url.endsWith('/api/apps/app-1/release-uploads')) {
          uploadPosts += 1;
          return envelope(
            {
              id: 'upload-conflict',
              applicationId: 'app-1',
              status: 'created',
              version: '1.0.1',
              sourceCommit: COMMIT,
              upload: {
                method: 'PUT',
                url: `${HUB}/api/release-uploads/upload-conflict/content`,
                auth: { mode: 'hub-bearer' },
              },
            },
            201,
          );
        }
        if (url.endsWith('/api/release-uploads/upload-conflict/content')) {
          return new Response(null, { status: 204 });
        }
        if (url.endsWith('/api/release-uploads/upload-conflict/complete')) {
          return envelope({ id: 'upload-conflict', status: 'verifying' }, 202);
        }
        if (url.endsWith('/api/release-uploads/upload-conflict')) {
          return envelope({
            id: 'upload-conflict',
            applicationId: 'app-1',
            status: 'failed',
            version: '1.0.1',
            sourceCommit: COMMIT,
            failure: {
              code: 'RELEASE_VERSION_CONFLICT',
              message:
                'Release version already exists with a different checksum.',
            },
          });
        }
        throw new Error(`Unexpected request: ${init?.method} ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadTestConfig();

    const failed = await runCommandAllowFailure(config, 'app:publish', [
      '--dir',
      project,
      '--bump',
      'patch',
      '--non-interactive',
      '--json',
      '--operation-id',
      'publish-conflict',
    ]);

    expect(failed.error).toMatchObject({ oclif: { exit: 5 } });
    expect(JSON.parse(failed.stdout)).toMatchObject({
      error: {
        code: 'RELEASE_VERSION_CONFLICT',
        hint: expect.stringContaining('nb3 app publish'),
      },
    });
    expect(JSON.parse(failed.stdout).error.hint).toContain('--version 1.0.2');
    expect(JSON.parse(failed.stdout).error.hint).not.toContain(
      '--operation-id',
    );
    expect(releaseReads).toBe(2);
    expect(uploadPosts).toBe(1);
  });

  it('requires the read scopes used by bump and deployment polling', async () => {
    const project = await createProject();
    await saveCredentialWithScopes([
      'apps:read',
      'source:read',
      'source:write',
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
    expect(output.error.code).toBe('INSUFFICIENT_SCOPE');
    expect(output.error.message).toContain('releases:read');
    expect(output.error.message).toContain('deployments:read');
  });

  it('does not resume a publish operation with different flags', async () => {
    const project = await createProject();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/api/apps/app-1')) {
          return envelope({
            id: 'app-1',
            slug: 'sales',
            name: 'Sales',
            status: 'active',
          });
        }
        if (url.endsWith('/api/apps/app-1/repository'))
          return envelope(repository());
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
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
    expect(JSON.parse(failed.stdout).error.hint).toContain('--dry-run');
    expect(JSON.parse(failed.stdout).error.hint).not.toContain('--deploy');
  });

  it('previews a deployment without creating it and reports current status', async () => {
    const project = await createProject();
    const calls: Array<{ method: string; url: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({ method: init?.method ?? 'GET', url });
        if (url.includes('/api/apps/app-1/releases')) {
          return envelope([
            {
              id: 'release-1',
              applicationId: 'app-1',
              version: '1.0.0',
              sourceCommit: COMMIT,
            },
          ]);
        }
        if (url.endsWith('/api/apps/app-1/repository'))
          return envelope(repository());
        if (url.endsWith('/api/apps/app-1/deployments?limit=20&offset=0')) {
          return envelope([], 200, { total: 0, limit: 20, offset: 0 });
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
      operationId: 'deploy-sales',
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
      repository: { headCommit: COMMIT },
      releases: [{ id: 'release-1', version: '1.0.0' }],
      deployments: [],
    });
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
      operationId: 'deploy-release',
      application: { id: 'app-1', slug: 'sales' },
      release: { id: 'release-1', version: '1.0.0' },
      deployment: { id: 'deployment-1', status: 'succeeded' },
    });
    const post = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/api/apps/app-1/deployments') &&
        init?.method === 'POST',
    );
    expect(post?.[1]).toMatchObject({
      headers: expect.objectContaining({
        'idempotency-key': 'deploy-release',
      }),
      body: JSON.stringify({
        targetReleaseId: 'release-1',
        type: 'deploy',
      }),
    });
    expect(
      await loadOperation('deploy-release', {
        root: process.env.NB3_CLI_ROOT,
      }),
    ).toMatchObject({
      kind: 'app-deploy',
      deployment: { id: 'deployment-1', type: 'deploy', status: 'succeeded' },
      resourceIds: {
        applicationId: 'app-1',
        releaseId: 'release-1',
        releaseVersion: '1.0.0',
        deploymentType: 'deploy',
      },
    });
  });

  it('rejects a resumed deploy operation with a different Release', async () => {
    const project = await createProject();
    const calls: Array<{ method: string; url: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({ method: init?.method ?? 'GET', url });
        if (url.endsWith('/api/apps/app-1')) {
          return envelope({
            id: 'app-1',
            slug: 'sales',
            name: 'Sales',
            status: 'active',
          });
        }
        if (url.includes('/api/apps/app-1/releases')) {
          return envelope([
            { id: 'release-1', applicationId: 'app-1', version: '1.0.0' },
            { id: 'release-2', applicationId: 'app-1', version: '2.0.0' },
          ]);
        }
        throw new Error(`Unexpected request: ${init?.method} ${url}`);
      }),
    );
    const config = await loadTestConfig();
    await runCommand(config, 'app:deploy', [
      '--dir',
      project,
      '--release',
      '1.0.0',
      '--dry-run',
      '--non-interactive',
      '--json',
      '--operation-id',
      'deploy-plan',
    ]);

    const failed = await runCommandAllowFailure(config, 'app:deploy', [
      '--dir',
      project,
      '--release',
      '2.0.0',
      '--dry-run',
      '--non-interactive',
      '--json',
      '--operation-id',
      'deploy-plan',
    ]);

    expect(failed.error).toMatchObject({ oclif: { exit: 2 } });
    expect(JSON.parse(failed.stdout).error.message).toContain(
      'already targets Release 1.0.0',
    );
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('does not silently keep a rollback when resumed without --rollback', async () => {
    const project = await createProject();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/api/apps/app-1')) {
          return envelope({
            id: 'app-1',
            slug: 'sales',
            name: 'Sales',
            status: 'active',
          });
        }
        if (url.includes('/api/apps/app-1/releases')) {
          return envelope([
            { id: 'release-1', applicationId: 'app-1', version: '1.0.0' },
          ]);
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const config = await loadTestConfig();
    await runCommand(config, 'app:deploy', [
      '--dir',
      project,
      '--release',
      '1.0.0',
      '--rollback',
      '--dry-run',
      '--non-interactive',
      '--json',
      '--operation-id',
      'rollback-plan',
    ]);
    expect(await loadOperation('rollback-plan')).toMatchObject({
      parameters: { dryRun: 'true', type: 'rollback' },
    });

    const failed = await runCommandAllowFailure(config, 'app:deploy', [
      '--dir',
      project,
      '--release',
      '1.0.0',
      '--dry-run',
      '--non-interactive',
      '--json',
      '--operation-id',
      'rollback-plan',
    ]);

    expect(failed.error).toMatchObject({ oclif: { exit: 2 } });
    expect(JSON.parse(failed.stdout).error.message).toContain(
      'different command parameters',
    );

    const changedDryRun = await runCommandAllowFailure(config, 'app:deploy', [
      '--dir',
      project,
      '--release',
      '1.0.0',
      '--rollback',
      '--non-interactive',
      '--json',
      '--operation-id',
      'rollback-plan',
    ]);
    expect(changedDryRun.error).toMatchObject({ oclif: { exit: 2 } });
    expect(JSON.parse(changedDryRun.stdout).error.hint).toContain('--dry-run');
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
        '--operation-id',
        'rollback-without-approval',
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
  await mkdir(path.join(project, '.git/info'), { recursive: true });
  await writeFile(
    path.join(project, '.nocobase/config.json'),
    `${JSON.stringify({
      applicationId: 'app-1',
      hub: HUB,
      name: 'Sales',
      repositoryMode: 'clone',
      slug: 'sales',
      sourceCommit: COMMIT,
    })}\n`,
  );
  await writeFile(
    path.join(project, 'package.json'),
    `${JSON.stringify({ name: 'sales', packageManager: 'pnpm@10.0.0', scripts: { build: 'noop' } })}\n`,
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

function releaseWorkflowFetch(): ReturnType<typeof vi.fn> {
  let uploadReads = 0;
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
    if (url.endsWith('/api/apps/app-1/repository'))
      return envelope(repository());
    if (url.endsWith('/api/apps/app-1/release-uploads')) {
      const body = JSON.parse(String(init?.body));
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
      uploadReads += 1;
      return envelope({
        id: 'upload-1',
        applicationId: 'app-1',
        status: uploadReads > 0 ? 'completed' : 'verifying',
        version: '1.0.0',
        sourceCommit: COMMIT,
        release: {
          id: 'release-1',
          applicationId: 'app-1',
          version: '1.0.0',
          sourceCommit: COMMIT,
        },
      });
    }
    throw new Error(`Unexpected request: ${init?.method} ${url}`);
  });
}

function deploymentWorkflowFetch(): ReturnType<typeof vi.fn> {
  let deploymentReads = 0;
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
        {
          id: 'release-1',
          applicationId: 'app-1',
          version: '1.0.0',
          sourceCommit: COMMIT,
        },
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
      deploymentReads += 1;
      return envelope({
        id: 'deployment-1',
        applicationId: 'app-1',
        targetReleaseId: 'release-1',
        type: 'deploy',
        status: deploymentReads > 0 ? 'succeeded' : 'running',
      });
    }
    throw new Error(`Unexpected request: ${init?.method} ${url}`);
  });
}

function repository(): Record<string, unknown> {
  return {
    applicationId: 'app-1',
    provider: 'hub',
    cloneUrl: `${HUB}/git/sales.git`,
    defaultBranch: 'main',
    headCommit: COMMIT,
    status: 'ready',
    updatedAt: '2026-08-25T00:00:00.000Z',
  };
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

async function saveCredential(): Promise<void> {
  return saveCredentialWithScopes([
    'profile',
    'apps:create',
    'apps:read',
    'source:read',
    'source:write',
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

async function writeFakeGit(target: string): Promise<void> {
  await writeFile(
    target,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.includes('clone')) {
  const destination = args.at(-1);
  fs.mkdirSync(path.join(destination, '.git/info'), { recursive: true });
  process.exit(0);
}
if (args[0] === 'status') process.exit(0);
if (args[0] === 'rev-parse') { process.stdout.write('${COMMIT}\\n'); process.exit(0); }
if (args[0] === 'push') process.exit(0);
process.stderr.write('Unsupported fake git invocation: ' + args.join(' '));
process.exit(2);
`,
    { mode: 0o700 },
  );
}

async function writeFakePackageManager(target: string): Promise<void> {
  await writeFile(
    target,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const output = path.join(process.env.NB3_CLI_ROOT, 'build-invocations.jsonl');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.appendFileSync(output, JSON.stringify({
  appBasePath: process.env.APP_BASE_PATH,
  browserBasePath: process.env.APP_BROWSER_BASE_PATH,
  secretVisible: Boolean(process.env.NB3_TEST_SECRET),
}) + '\\n');
`,
    { mode: 0o700 },
  );
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
