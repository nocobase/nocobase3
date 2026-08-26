import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import type { Config } from '@oclif/core';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadTestConfig, runCommand } from './helpers.ts';

interface TarEntry {
  name: string;
  contents: Buffer;
  mode: number;
  uid: number;
  gid: number;
  mtime: number;
}

interface RecordedRequest {
  url: string;
  init: RequestInit;
  body: Buffer;
}

const created: string[] = [];
let config: Config;

beforeAll(async () => {
  config = await loadTestConfig();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.NB3_HUB_TOKEN;
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createApp(
  options: {
    name?: string;
    withDist?: boolean;
    withBuild?: boolean;
  } = {},
): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nb3-deploy-test-'));
  created.push(directory);
  const name = options.name ?? 'crm';

  await mkdir(path.join(directory, '.nb3'), { recursive: true });
  await writeFile(
    path.join(directory, '.nb3', 'config.json'),
    JSON.stringify({
      hub: 'https://hub.example.test/hub/',
      name,
      template: '@nocobase/app-template-default',
      templateVersion: '0.0.1',
    }),
    'utf8',
  );

  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name,
      displayName: '客户管理',
      version: '1.2.3',
      packageManager: 'npm@11.0.0',
      scripts: options.withBuild
        ? { build: 'node build.mjs', secretScript: 'echo do-not-package' }
        : {},
      dependencies: { secretDependency: '1.0.0' },
      nocobase: { privateConfig: true },
    }),
    'utf8',
  );

  if (options.withBuild) {
    await writeFile(
      path.join(directory, 'build.mjs'),
      [
        "import { mkdir, writeFile } from 'node:fs/promises';",
        "await mkdir('dist/server', { recursive: true });",
        "await writeFile('dist/server/embedded.js', 'export default {}\\n');",
        "await writeFile('seen-token.txt', process.env.NB3_HUB_TOKEN ?? 'missing');",
      ].join('\n'),
      'utf8',
    );
  }

  if (options.withDist !== false && !options.withBuild) {
    await mkdir(path.join(directory, 'dist', 'client'), { recursive: true });
    await mkdir(path.join(directory, 'dist', 'server'), { recursive: true });
    await writeFile(
      path.join(directory, 'dist', 'client', 'index.html'),
      '<h1>CRM</h1>\n',
      'utf8',
    );
    await writeFile(
      path.join(directory, 'dist', 'server', 'embedded.js'),
      'export default {}\n',
      'utf8',
    );
    await writeFile(
      path.join(directory, 'dist', '.env'),
      'DATABASE_PASSWORD=never-package-this\n',
      'utf8',
    );
  }

  return directory;
}

async function bodyBuffer(body: BodyInit | null | undefined): Promise<Buffer> {
  if (body === undefined || body === null) {
    return Buffer.alloc(0);
  }
  if (typeof body === 'string') {
    return Buffer.from(body);
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parseOctal(header: Buffer, start: number, length: number): number {
  const value = header
    .subarray(start, start + length)
    .toString('ascii')
    .replaceAll('\0', '')
    .trim();
  return value ? Number.parseInt(value, 8) : 0;
}

function parseTarGzip(archive: Buffer): TarEntry[] {
  const tar = gunzipSync(archive);
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const name = header.subarray(0, 100).toString('utf8').split('\0')[0];
    const size = parseOctal(header, 124, 12);
    const contentsStart = offset + 512;
    entries.push({
      name,
      contents: tar.subarray(contentsStart, contentsStart + size),
      mode: parseOctal(header, 100, 8),
      uid: parseOctal(header, 108, 8),
      gid: parseOctal(header, 116, 8),
      mtime: parseOctal(header, 136, 12),
    });
    offset = contentsStart + Math.ceil(size / 512) * 512;
  }

  return entries;
}

function installSuccessfulFetch(requests: RecordedRequest[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      const body = await bodyBuffer(init.body);
      requests.push({ url, init, body });

      if (init.method === 'PUT') {
        return Response.json({ status: 'uploaded' }, { status: 201 });
      }

      return Response.json(
        { approval: { id: 'approval-123', status: 'pending' } },
        { status: 202 },
      );
    }),
  );
}

function hashArtifact(files: Array<[string, Buffer]>): string {
  const hash = createHash('sha256');
  for (const [name, contents] of files.sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    hash.update(name);
    hash.update('\0');
    hash.update(contents);
    hash.update('\0');
  }
  return hash.digest('hex');
}

describe('app deploy', () => {
  it('streams a deterministic safe release, uploads it, and requests approval', async () => {
    const directory = await createApp();
    const requests: RecordedRequest[] = [];
    installSuccessfulFetch(requests);
    process.env.NB3_HUB_TOKEN = 'environment-secret-token';

    const first = await runCommand(config, 'app:deploy', [
      '--dir',
      directory,
      '--no-build',
    ]);
    const second = await runCommand(config, 'app:deploy', [
      '--dir',
      directory,
      '--no-build',
    ]);

    expect(requests).toHaveLength(4);
    const uploads = [requests[0], requests[2]];
    expect(uploads[0].url).toMatch(
      /^https:\/\/hub\.example\.test\/hub\/api\/apps\/crm\/releases\/1\.2\.3-[a-f0-9]{12}$/,
    );
    expect(uploads[0].init).toMatchObject({
      method: 'PUT',
      redirect: 'manual',
    });
    expect(new Headers(uploads[0].init.headers)).toMatchObject(
      expect.objectContaining({}),
    );
    expect(new Headers(uploads[0].init.headers).get('authorization')).toBe(
      'Bearer environment-secret-token',
    );
    expect(new Headers(uploads[0].init.headers).get('content-type')).toBe(
      'application/vnd.nocobase.release+tar+gzip',
    );
    expect(uploads[0].body).toEqual(uploads[1].body);

    const entries = parseTarGzip(uploads[0].body);
    expect(entries.map((entry) => entry.name)).toEqual([
      'app-release.json',
      'package.json',
      'dist/client/index.html',
      'dist/server/embedded.js',
    ]);
    expect(
      entries.every(
        ({ gid, mtime, uid }) => gid === 0 && mtime === 0 && uid === 0,
      ),
    ).toBe(true);
    expect(entries.every(({ mode }) => mode === 0o644)).toBe(true);
    expect(uploads[0].body.toString()).not.toContain('never-package-this');

    const artifactSha256 = hashArtifact([
      ['client/index.html', Buffer.from('<h1>CRM</h1>\n')],
      ['server/embedded.js', Buffer.from('export default {}\n')],
    ]);
    const manifest = JSON.parse(entries[0].contents.toString('utf8')) as Record<
      string,
      unknown
    >;
    expect(manifest).toEqual({
      schemaVersion: 1,
      appId: 'crm',
      releaseId: `1.2.3-${artifactSha256.slice(0, 12)}`,
      version: '1.2.3',
      artifactSha256,
      runtime: {
        backend: 'in-process',
        isolation: 'in-process',
        tier: 'warm',
        healthPath: '/api/healthz',
      },
    });
    expect(manifest).not.toHaveProperty('createdAt');

    const releasePackage = JSON.parse(
      entries[1].contents.toString('utf8'),
    ) as Record<string, unknown>;
    expect(releasePackage).toEqual({
      name: 'crm',
      displayName: '客户管理',
      version: '1.2.3',
      type: 'module',
    });
    expect(releasePackage).not.toHaveProperty('scripts');
    expect(releasePackage).not.toHaveProperty('dependencies');
    expect(releasePackage).not.toHaveProperty('nocobase');

    const approvalRequest = requests[1];
    expect(approvalRequest.url).toBe(
      'https://hub.example.test/hub/api/release-management/apps/crm/deployments',
    );
    expect(approvalRequest.init.method).toBe('POST');
    expect(new Headers(approvalRequest.init.headers).get('authorization')).toBe(
      'Bearer environment-secret-token',
    );
    expect(
      new Headers(approvalRequest.init.headers).get('idempotency-key'),
    ).toMatch(/^nb3-deploy-[a-f0-9]{32}$/);
    expect(new Headers(requests[3].init.headers).get('idempotency-key')).toBe(
      new Headers(approvalRequest.init.headers).get('idempotency-key'),
    );
    expect(JSON.parse(approvalRequest.body.toString('utf8'))).toEqual({
      releaseId: manifest.releaseId,
    });
    expect(first.stdout).toContain('uploaded');
    expect(first.stdout).toContain('approval-123');
    expect(first.stdout).toContain('https://hub.example.test/hub/deliveries');
    expect(`${first.stdout}\n${second.stdout}`).not.toContain(
      'environment-secret-token',
    );
  });

  it('supports explicit release IDs, tokens, and machine-readable output', async () => {
    const directory = await createApp();
    const requests: RecordedRequest[] = [];
    installSuccessfulFetch(requests);

    const result = await runCommand(config, 'app:deploy', [
      '--dir',
      directory,
      '--hub',
      'https://hub.example.test/hub////',
      '--token',
      'flag-secret-token',
      '--release-id',
      'preview-7',
      '--no-build',
      '--json',
    ]);

    expect(requests[0].url).toContain('/releases/preview-7');
    expect(result.lines).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      appId: 'crm',
      releaseId: 'preview-7',
      version: '1.2.3',
      artifactSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      upload: 'uploaded',
      approvalId: 'approval-123',
      approvalStatus: 'pending',
      deliveriesUrl: 'https://hub.example.test/hub/deliveries',
      dryRun: false,
    });
    expect(result.stdout).not.toContain('flag-secret-token');
  });

  it('reports an unchanged upload while reusing the deterministic approval request', async () => {
    const directory = await createApp();
    process.env.NB3_HUB_TOKEN = 'environment-secret-token';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init: RequestInit = {}) => {
        await bodyBuffer(init.body);
        if (init.method === 'PUT') {
          return Response.json({ status: 'unchanged' }, { status: 200 });
        }
        return Response.json(
          { approval: { id: 'approval-existing', status: 'pending' } },
          { status: 202 },
        );
      }),
    );

    const result = await runCommand(config, 'app:deploy', [
      '--dir',
      directory,
      '--no-build',
    ]);

    expect(result.stdout).toContain('unchanged');
    expect(result.stdout).toContain('approval-existing');
  });

  it('builds with the detected package manager by default', async () => {
    const directory = await createApp({ withBuild: true, withDist: false });
    process.env.NB3_HUB_TOKEN = 'must-not-reach-build';

    const result = await runCommand(config, 'app:deploy', [
      '--dir',
      directory,
      '--dry-run',
    ]);

    expect(result.stdout).toContain('Building crm with npm');
    expect(result.stdout).toContain('Dry run');
    expect(
      await readFile(path.join(directory, 'dist/server/embedded.js'), 'utf8'),
    ).toContain('export default');
    expect(await readFile(path.join(directory, 'seen-token.txt'), 'utf8')).toBe(
      'missing',
    );
  });

  it('does not require credentials or access the network during a dry run', async () => {
    const directory = await createApp();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await runCommand(config, 'app:deploy', [
      '--dir',
      directory,
      '--no-build',
      '--dry-run',
      '--json',
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(result.stdout)).toMatchObject({
      appId: 'crm',
      upload: 'dry-run',
      approvalId: null,
      dryRun: true,
    });
  });

  it('rejects unsafe app and release IDs before accessing the network', async () => {
    const directory = await createApp({ name: '../escape' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      runCommand(config, 'app:deploy', [
        '--dir',
        directory,
        '--token',
        'secret',
        '--release-id',
        '../release',
        '--no-build',
      ]),
    ).rejects.toThrow(/App ID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects App IDs that the App Host runtime cannot activate', async () => {
    const directory = await createApp({ name: 'crm.v2' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      runCommand(config, 'app:deploy', [
        '--dir',
        directory,
        '--no-build',
        '--dry-run',
      ]),
    ).rejects.toThrow(/App ID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects symlinks anywhere in dist', async () => {
    const directory = await createApp();
    await symlink(
      path.join(directory, 'package.json'),
      path.join(directory, 'dist', 'client', 'linked-package.json'),
    );

    await expect(
      runCommand(config, 'app:deploy', [
        '--dir',
        directory,
        '--no-build',
        '--dry-run',
      ]),
    ).rejects.toThrow(/symbolic link/i);
  });

  it('requires the embedded server entrypoint', async () => {
    const directory = await createApp({ withDist: false });
    await mkdir(path.join(directory, 'dist'), { recursive: true });

    await expect(
      runCommand(config, 'app:deploy', [
        '--dir',
        directory,
        '--no-build',
        '--dry-run',
      ]),
    ).rejects.toThrow(/dist\/server\/embedded\.js/);
  });

  it('reports Hub failures without leaking the token', async () => {
    const directory = await createApp();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { code: 'RELEASE_CONFLICT', error: 'Release already differs' },
          { status: 409 },
        ),
      ),
    );

    let message = '';
    try {
      await runCommand(config, 'app:deploy', [
        '--dir',
        directory,
        '--token',
        'never-show-this-token',
        '--no-build',
      ]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('RELEASE_CONFLICT');
    expect(message).toContain('Release already differs');
    expect(message).not.toContain('never-show-this-token');
  });

  it('redacts the token from network error chains', async () => {
    const directory = await createApp();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('socket failed near network-secret-token');
      }),
    );

    let chain = '';
    try {
      await runCommand(config, 'app:deploy', [
        '--dir',
        directory,
        '--token',
        'network-secret-token',
        '--no-build',
      ]);
    } catch (error) {
      let current: unknown = error;
      while (current instanceof Error) {
        chain += `${current.message}\n`;
        current = current.cause;
      }
    }

    expect(chain).toContain('[REDACTED]');
    expect(chain).not.toContain('network-secret-token');
  });
});
