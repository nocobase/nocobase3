import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialStore } from '../src/lib/credential-store.ts';
import { loadTestConfig, runCommand } from './helpers.ts';

const HUB = 'https://hub.example.com/hub';
let root: string;
let originalRoot: string | undefined;
let originalPath: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'nb3-agent-commands-'));
  originalRoot = process.env.NB3_CLI_ROOT;
  originalPath = process.env.PATH;
  process.env.NB3_CLI_ROOT = path.join(root, 'user-data');
});

afterEach(async () => {
  vi.unstubAllGlobals();
  restoreEnvironment('NB3_CLI_ROOT', originalRoot);
  restoreEnvironment('PATH', originalPath);
  await rm(root, { recursive: true, force: true });
});

describe('Hub agent commands', () => {
  it('logs in with the minimum read scopes by default and persists the token', async () => {
    const fetchMock = loginFetch('profile apps:read source:read');
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadTestConfig();
    const result = await runCommand(config, 'hub:login', [
      '--hub',
      HUB,
      '--json',
    ]);

    const deviceBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(deviceBody.scopes).toEqual(['profile', 'apps:read', 'source:read']);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      hub: HUB,
      credentialId: 'credential',
    });
    expect(await new CredentialStore().get(HUB)).toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      credentialId: 'credential',
    });
  });

  it('supports explicit repeated scopes', async () => {
    const fetchMock = loginFetch('apps:read source:write');
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadTestConfig();

    await runCommand(config, 'hub:login', [
      '--hub',
      HUB,
      '--scope',
      'apps:read',
      '--scope',
      'source:write',
    ]);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.scopes).toEqual(['apps:read', 'source:write']);
  });

  it('lists applications as one JSON result using the persisted credential', async () => {
    await saveCredential();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            { id: 'app-1', slug: 'sales', name: 'Sales', status: 'active' },
          ],
          meta: { total: 1, limit: 20, offset: 0 },
          requestId: 'req-list',
        }),
      ),
    );
    const config = await loadTestConfig();
    const result = await runCommand(config, 'app:list', [
      '--hub',
      HUB,
      '--json',
    ]);

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      hub: HUB,
      applications: [{ id: 'app-1', slug: 'sales' }],
      pagination: { total: 1, limit: 20, offset: 0 },
      requestId: 'req-list',
    });
  });

  it('revokes the remote refresh token before removing the local credential', async () => {
    await saveCredential();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { revoked: true } }));
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadTestConfig();
    const result = await runCommand(config, 'hub:logout', [
      '--hub',
      HUB,
      '--json',
    ]);

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      clientId: 'nb3-cli',
      refreshToken: 'refresh',
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      alreadyLoggedOut: false,
    });
    expect(await new CredentialStore().get(HUB)).toBeUndefined();
  });

  it('pulls an exact slug and records its Hub identity in local .nocobase state', async () => {
    await saveCredential();
    const destination = path.join(root, 'sales');
    const invocation = path.join(root, 'git-invocation.json');
    const bin = path.join(root, 'bin');
    const fakeGit = path.join(bin, 'git');
    await mkdir(bin, { recursive: true });
    await writeFile(
      fakeGit,
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const destination = args.at(-1);
fs.mkdirSync(destination + '/.git/info', { recursive: true });
fs.writeFileSync(destination + '/.git/config', '[remote "hub"]\\n  url = ' + args.at(-2) + '\\n');
fs.writeFileSync('${invocation}', JSON.stringify({ args, askpass: Boolean(process.env.GIT_ASKPASS), prompt: process.env.GIT_TERMINAL_PROMPT, tokenSet: Boolean(process.env.NB3_GIT_ACCESS_TOKEN) }));
`,
      { mode: 0o700 },
    );
    process.env.PATH = `${bin}${path.delimiter}${originalPath ?? ''}`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/api/apps?')
          ? jsonResponse({
              data: [
                {
                  id: 'app-1',
                  slug: 'sales',
                  name: 'Sales',
                  status: 'active',
                },
              ],
              meta: { total: 1, limit: 100, offset: 0 },
            })
          : jsonResponse({
              data: {
                applicationId: 'app-1',
                provider: 'hub',
                cloneUrl: `${HUB}/git/sales.git`,
                defaultBranch: 'main',
                headCommit: 'abc123',
                status: 'ready',
                updatedAt: '2026-08-25T00:00:00.000Z',
              },
            }),
      ),
    );
    const config = await loadTestConfig();
    const result = await runCommand(config, 'app:pull', [
      'sales',
      destination,
      '--hub',
      HUB,
      '--non-interactive',
      '--json',
    ]);

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      application: { id: 'app-1', slug: 'sales' },
      directory: destination,
    });
    expect(
      JSON.parse(
        await readFile(
          path.join(destination, '.nocobase', 'config.json'),
          'utf8',
        ),
      ),
    ).toEqual({
      applicationId: 'app-1',
      hub: HUB,
      name: 'Sales',
      repositoryMode: 'clone',
      slug: 'sales',
      sourceCommit: 'abc123',
    });
    expect(
      await readFile(path.join(destination, '.git', 'info', 'exclude'), 'utf8'),
    ).toContain('/.nocobase/');
    const gitInvocation = JSON.parse(await readFile(invocation, 'utf8')) as {
      args: string[];
      askpass: boolean;
      prompt: string;
      tokenSet: boolean;
    };
    expect(gitInvocation.args.join(' ')).not.toContain('access');
    expect(gitInvocation).toMatchObject({
      askpass: true,
      prompt: '0',
      tokenSet: true,
    });
    expect(
      await readFile(path.join(destination, '.git', 'config'), 'utf8'),
    ).not.toContain('access');
  });
});

async function saveCredential(): Promise<void> {
  await new CredentialStore().set({
    hub: HUB,
    clientId: 'nb3-cli',
    credentialId: 'credential',
    accessToken: 'access',
    accessTokenExpiresAt: Date.now() + 600_000,
    refreshToken: 'refresh',
    refreshTokenExpiresAt: Date.now() + 3_600_000,
    scopes: ['profile', 'apps:read', 'source:read'],
    applicationScope: { mode: 'all-authorized' },
  });
}

function loginFetch(scope: string): ReturnType<typeof vi.fn> {
  return vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse(
        {
          data: {
            deviceCode: 'device',
            userCode: 'ABCD',
            verificationUri: `${HUB}/agent-authorize`,
            expiresIn: 600,
            interval: 0,
          },
        },
        201,
      ),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        data: {
          credentialId: 'credential',
          accessToken: 'access',
          tokenType: 'Bearer',
          expiresIn: 900,
          refreshToken: 'refresh',
          refreshExpiresIn: 3600,
          scope,
          applicationScope: { mode: 'all-authorized' },
        },
      }),
    );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
