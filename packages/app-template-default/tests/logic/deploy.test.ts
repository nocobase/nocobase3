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
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type DeployBuildContext,
  runDeployCommand,
} from '../../scripts/deploy.js';

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

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

const created: string[] = [];

afterEach(async () => {
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
  const directory = await mkdtemp(path.join(os.tmpdir(), 'app-deploy-test-'));
  created.push(directory);
  const name = options.name ?? 'crm';

  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name,
      displayName: '客户管理',
      version: '1.2.3',
      packageManager: 'pnpm@11.7.0',
      scripts: options.withBuild
        ? { build: 'node build.mjs', secretScript: 'echo do-not-package' }
        : {},
      dependencies: { secretDependency: '1.0.0' },
      nocobase: { privateConfig: true },
    }),
    'utf8',
  );

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
  if (body === undefined || body === null) return Buffer.alloc(0);
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);

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
    if (header.every((byte) => byte === 0)) break;
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

function installSuccessfulFetch(requests: RecordedRequest[]): typeof fetch {
  return vi.fn(
    async (input: string | URL | Request, init: RequestInit = {}) => {
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
    },
  ) as typeof fetch;
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

async function run(
  appDirectory: string,
  argv: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
    interactive?: boolean;
    promptToken?: () => Promise<string>;
    runBuild?: (context: DeployBuildContext) => Promise<void>;
  } = {},
): Promise<CommandResult> {
  let stdout = '';
  let stderr = '';
  const code = await runDeployCommand({
    appDirectory,
    argv,
    env: options.env ?? {},
    fetch: options.fetch ?? vi.fn(),
    interactive: options.interactive ?? false,
    promptToken: options.promptToken,
    runBuild: options.runBuild,
    stdout: { write: (value) => (stdout += value) },
    stderr: { write: (value) => (stderr += value) },
  });
  return { code, stdout, stderr };
}

describe('pnpm run deploy', () => {
  it('is declared by the published App template', async () => {
    const manifest = JSON.parse(
      await readFile(
        path.resolve(import.meta.dirname, '../../package.json'),
        'utf8',
      ),
    ) as { scripts?: Record<string, string> };

    expect(manifest.scripts?.deploy).toBe(
      'tsx --tsconfig tsconfig.node.json ./scripts/deploy.ts',
    );
  });

  it('streams a deterministic safe release, uploads it, and requests approval without .nb3 state', async () => {
    const directory = await createApp();
    const requests: RecordedRequest[] = [];
    const fetch = installSuccessfulFetch(requests);

    const first = await run(
      directory,
      [
        '--hub',
        'https://hub.example.test/hub/',
        '--token',
        'environment-secret-token',
        '--no-build',
      ],
      { fetch },
    );
    const second = await run(
      directory,
      [
        '--hub',
        'https://hub.example.test/hub/',
        '--token',
        'environment-secret-token',
        '--no-build',
      ],
      { fetch },
    );

    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(requests).toHaveLength(4);
    const uploads = [requests[0], requests[2]];
    expect(uploads[0].url).toMatch(
      /^https:\/\/hub\.example\.test\/hub\/api\/apps\/crm\/releases\/1\.2\.3-[a-f0-9]{12}$/,
    );
    expect(uploads[0].init).toMatchObject({
      method: 'PUT',
      redirect: 'manual',
    });
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

  it('prompts for a masked token only on an interactive terminal', async () => {
    const directory = await createApp();
    const requests: RecordedRequest[] = [];
    const promptToken = vi.fn(async () => 'prompt-secret-token');

    const interactive = await run(
      directory,
      ['--hub', 'https://hub.example.test/hub', '--no-build'],
      {
        fetch: installSuccessfulFetch(requests),
        interactive: true,
        promptToken,
      },
    );
    expect(interactive.code).toBe(0);
    expect(promptToken).toHaveBeenCalledOnce();
    expect(interactive.stdout).not.toContain('prompt-secret-token');
    expect(interactive.stderr).not.toContain('prompt-secret-token');

    const headless = await run(directory, [
      '--hub',
      'https://hub.example.test/hub',
      '--no-build',
    ]);
    expect(headless.code).toBe(1);
    expect(headless.stderr).toContain('NB3_HUB_TOKEN');
    expect(headless.stderr).toContain('--token');
  });

  it('keeps JSON mode non-interactive when credentials are missing', async () => {
    const directory = await createApp();
    const promptToken = vi.fn(async () => 'prompt-secret-token');

    const result = await run(
      directory,
      ['--hub', 'https://hub.example.test/hub', '--no-build', '--json'],
      { interactive: true, promptToken },
    );

    expect(result.code).toBe(1);
    expect(promptToken).not.toHaveBeenCalled();
    expect(result.stderr).toContain('NB3_HUB_TOKEN');
  });

  it('supports machine-readable dry runs without credentials or network access', async () => {
    const directory = await createApp();
    const fetch = vi.fn();

    const result = await run(
      directory,
      [
        '--hub',
        'https://hub.example.test/hub',
        '--no-build',
        '--dry-run',
        '--json',
      ],
      { fetch },
    );

    expect(result.code).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      appId: 'crm',
      upload: 'dry-run',
      approvalId: null,
      dryRun: true,
    });
  });

  it('keeps build progress out of machine-readable stdout', async () => {
    const directory = await createApp({ withBuild: true, withDist: false });
    const runBuild = async (context: DeployBuildContext) => {
      context.stdout.write('build progress\n');
      await mkdir(path.join(directory, 'dist', 'server'), { recursive: true });
      await writeFile(
        path.join(directory, 'dist', 'server', 'embedded.js'),
        'export default {}\n',
        'utf8',
      );
    };

    const result = await run(
      directory,
      ['--hub', 'https://hub.example.test/hub', '--dry-run', '--json'],
      { runBuild },
    );

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      appId: 'crm',
      upload: 'dry-run',
    });
    expect(result.stderr).toContain('build progress');
  });

  it('removes the deployment token before running the App build', async () => {
    const directory = await createApp({ withBuild: true, withDist: false });
    const runBuild = vi.fn(async (context: DeployBuildContext) => {
      expect(context.env.NB3_HUB_TOKEN).toBeUndefined();
      await mkdir(path.join(directory, 'dist', 'server'), { recursive: true });
      await writeFile(
        path.join(directory, 'dist', 'server', 'embedded.js'),
        'export default {}\n',
        'utf8',
      );
    });

    const result = await run(
      directory,
      ['--hub', 'https://hub.example.test/hub', '--dry-run'],
      {
        env: { NB3_HUB_TOKEN: 'must-not-reach-build' },
        runBuild,
      },
    );

    expect(result.code).toBe(0);
    expect(runBuild).toHaveBeenCalledOnce();
  });

  it('rejects unsafe App IDs, release IDs, and dist symlinks before network access', async () => {
    const invalidApp = await createApp({ name: 'crm.v2' });
    const invalidRelease = await createApp();
    const linkedDist = await createApp();
    await symlink(
      path.join(linkedDist, 'package.json'),
      path.join(linkedDist, 'dist', 'client', 'linked-package.json'),
    );
    const fetch = vi.fn();

    const appResult = await run(
      invalidApp,
      ['--hub', 'https://hub.example.test/hub', '--no-build', '--dry-run'],
      { fetch },
    );
    const releaseResult = await run(
      invalidRelease,
      [
        '--hub',
        'https://hub.example.test/hub',
        '--release-id',
        '../release',
        '--no-build',
        '--dry-run',
      ],
      { fetch },
    );
    const symlinkResult = await run(
      linkedDist,
      ['--hub', 'https://hub.example.test/hub', '--no-build', '--dry-run'],
      { fetch },
    );

    expect(appResult.stderr).toContain('App ID');
    expect(releaseResult.stderr).toContain('Release ID');
    expect(symlinkResult.stderr).toMatch(/symbolic link/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports Hub failures without leaking deployment tokens', async () => {
    const directory = await createApp();
    const fetch = vi.fn(async () =>
      Response.json(
        {
          code: 'RELEASE_CONFLICT',
          error: 'Release differs near never-show-this-token',
        },
        { status: 409 },
      ),
    ) as typeof globalThis.fetch;

    const result = await run(
      directory,
      [
        '--hub',
        'https://hub.example.test/hub',
        '--token',
        'never-show-this-token',
        '--no-build',
      ],
      { fetch },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('RELEASE_CONFLICT');
    expect(result.stderr).toContain('[REDACTED]');
    expect(result.stderr).not.toContain('never-show-this-token');
  });

  it('redacts deployment tokens from network errors', async () => {
    const directory = await createApp();
    const fetch = vi.fn(async () => {
      throw new Error('socket failed near network-secret-token', {
        cause: new Error('nested network-secret-token'),
      });
    }) as typeof globalThis.fetch;

    const result = await run(
      directory,
      [
        '--hub',
        'https://hub.example.test/hub',
        '--token',
        'network-secret-token',
        '--no-build',
      ],
      { fetch },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('[REDACTED]');
    expect(result.stderr).not.toContain('network-secret-token');
  });

  it('provides local help and an actionable missing Hub error', async () => {
    const directory = await createApp();

    const help = await run(directory, ['--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('pnpm run deploy --hub');
    expect(help.stdout).toContain('--dry-run');
    expect(help.stdout).toContain('Examples:');

    const missingHub = await run(directory, ['--no-build', '--dry-run']);
    expect(missingHub.code).toBe(2);
    expect(missingHub.stderr).toContain('--hub <url>');
    expect(missingHub.stderr).toContain('pnpm run deploy --hub');

    const removedDirectoryFlag = await run(directory, [
      '--dir',
      directory,
      '--hub',
      'https://hub.example.test/hub',
      '--dry-run',
    ]);
    expect(removedDirectoryFlag.code).toBe(2);
    expect(removedDirectoryFlag.stderr).toContain('Unknown option "--dir"');
    expect(removedDirectoryFlag.stderr).toContain('pnpm run deploy --help');
  });
});
