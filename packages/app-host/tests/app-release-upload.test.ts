import { createHash, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import {
  appendFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, expect, it } from 'vitest';

import { createAppHost, type AppHost } from '../dist/index.js';
import { AppReleaseUploader } from '../dist/app-release-upload.js';

interface TarEntry {
  name: string;
  content?: string | Uint8Array;
  type?: 'file' | 'directory' | 'symlink';
  linkname?: string;
}

const tempDirs: string[] = [];
const runningHosts: AppHost[] = [];

afterEach(async () => {
  await Promise.all(
    runningHosts.splice(0).map((host) => host.close('test cleanup')),
  );
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

it('rejects App IDs that cannot be registered by the runtime', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-upload-app-id-'),
  );
  tempDirs.push(appsDir);
  const host = await startHost(appsDir);

  const response = await uploadRelease(
    `${hostBaseUrl(host)}/__apps/orders.v2/releases/release-1`,
    releaseArchive('orders.v2', 'release-1', '1.0.0'),
    { authorization: 'Bearer control-secret' },
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    code: 'APP_RELEASE_ARCHIVE_INVALID',
  });
});

it('fails closed when the Release upload control token is not configured', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-upload-no-token-'),
  );
  tempDirs.push(appsDir);
  const host = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
  });
  runningHosts.push(host);
  await host.start();

  const response = await uploadRelease(
    `${hostBaseUrl(host)}/__apps/orders/releases/release-1`,
    releaseArchive('orders', 'release-1', '1.0.0'),
    { authorization: 'Bearer arbitrary-token' },
  );

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    code: 'APP_HOST_UNAUTHORIZED',
  });
  await expect(
    lstat(path.join(appsDir, 'orders', 'releases', 'release-1')),
  ).rejects.toMatchObject({ code: 'ENOENT' });
});

it('ignores runtime-owned Release paths when checking an identical upload', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-upload-runtime-path-'),
  );
  tempDirs.push(appsDir);
  const host = await startHost(appsDir);
  const uploadUrl = `${hostBaseUrl(host)}/__apps/orders/releases/release-1`;
  const archive = releaseArchive('orders', 'release-1', '1.0.0');

  const created = await uploadRelease(uploadUrl, archive, {
    authorization: 'Bearer control-secret',
  });
  expect(created.status).toBe(201);

  const releaseRoot = path.join(appsDir, 'orders', 'releases', 'release-1');
  const storageDir = path.join(appsDir, 'orders', 'data', 'storage');
  await mkdir(storageDir, { recursive: true });
  await mkdir(path.join(releaseRoot, 'public'), { recursive: true });
  await symlink(storageDir, path.join(releaseRoot, 'public', 'storage'));

  const unchanged = await uploadRelease(uploadUrl, archive, {
    authorization: 'Bearer control-secret',
  });
  expect(unchanged.status).toBe(200);
  await expect(unchanged.json()).resolves.toMatchObject({
    status: 'unchanged',
  });

  await appendFile(
    path.join(releaseRoot, 'dist', 'server', 'embedded.js'),
    '\n// tampered\n',
  );
  const tampered = await uploadRelease(uploadUrl, archive, {
    authorization: 'Bearer control-secret',
  });
  expect(tampered.status).toBe(409);
  await expect(tampered.json()).resolves.toMatchObject({
    code: 'APP_RELEASE_INTEGRITY_FAILED',
  });
});

it('accepts authenticated immutable release uploads and restores a private runtime secret', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-upload-'),
  );
  tempDirs.push(appsDir);
  const archive = releaseArchive('orders', 'release-1', '1.0.0');
  const firstHost = await startHost(appsDir);
  const firstBaseUrl = hostBaseUrl(firstHost);
  const uploadUrl = `${firstBaseUrl}/__apps/orders/releases/release-1`;

  const unauthorized = await uploadRelease(uploadUrl, archive);
  expect(unauthorized.status).toBe(401);

  const created = await uploadRelease(uploadUrl, archive, {
    authorization: 'Bearer control-secret',
  });
  expect(created.status).toBe(201);
  await expect(created.json()).resolves.toMatchObject({
    status: 'created',
    release: {
      appId: 'orders',
      id: 'release-1',
      version: '1.0.0',
    },
  });

  const unchanged = await uploadRelease(uploadUrl, archive, {
    authorization: 'Bearer control-secret',
  });
  expect(unchanged.status).toBe(200);
  await expect(unchanged.json()).resolves.toMatchObject({
    status: 'unchanged',
  });

  const notDeployed = await fetch(`${firstBaseUrl}/orders/runtime-secret`);
  expect(notDeployed.status).toBe(404);

  const changedArchive = releaseArchive('orders', 'release-1', '1.0.0', {
    packageMarker: 'changed',
  });
  const immutable = await uploadRelease(uploadUrl, changedArchive, {
    authorization: 'Bearer control-secret',
  });
  expect(immutable.status).toBe(409);
  await expect(immutable.json()).resolves.toMatchObject({
    code: 'APP_RELEASE_IMMUTABLE',
  });

  const manifestContent = await readFile(
    path.join(appsDir, 'orders', 'releases', 'release-1', 'app-release.json'),
    'utf8',
  );
  expect(manifestContent).not.toContain('authSecret');
  expect(await readdir(path.join(appsDir, '.uploads'))).toEqual([]);

  const deploy = await fetch(`${firstBaseUrl}/__apps/orders/deploy`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer control-secret',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ releaseId: 'release-1' }),
  });
  expect(deploy.status).toBe(200);
  const firstRuntime = await fetch(`${firstBaseUrl}/orders/runtime-secret`);
  expect(firstRuntime.status).toBe(200);
  const firstSecret = (await firstRuntime.json()) as {
    authSecret: string;
    artifactValue: string;
  };
  expect(firstSecret.authSecret).toMatch(/^[a-f0-9]{64}$/);
  expect(firstSecret.artifactValue).toBe('preserved');

  const management = await fetch(`${firstBaseUrl}/__apps`, {
    headers: { authorization: 'Bearer control-secret' },
  });
  expect(await management.text()).not.toContain(firstSecret.authSecret);

  const secretFile = path.join(appsDir, '.app-host', 'runtime-secrets.json');
  expect((await lstat(secretFile)).mode & 0o777).toBe(0o600);
  const persistedSecrets = await readFile(secretFile, 'utf8');
  expect(persistedSecrets).toContain(firstSecret.authSecret);
  expect(manifestContent).not.toContain(firstSecret.authSecret);

  await firstHost.close('restart test');
  runningHosts.splice(runningHosts.indexOf(firstHost), 1);

  const restoredHost = await startHost(appsDir);
  const restoredRuntime = await fetch(
    `${hostBaseUrl(restoredHost)}/orders/runtime-secret`,
  );
  expect(restoredRuntime.status).toBe(200);
  await expect(restoredRuntime.json()).resolves.toEqual(firstSecret);
});

it('rejects malformed, unsafe, or oversized release archives and always cleans staging', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-upload-invalid-'),
  );
  tempDirs.push(appsDir);
  const host = await startHost(appsDir);
  const baseUrl = hostBaseUrl(host);

  const wrongType = await fetch(`${baseUrl}/__apps/orders/releases/release-1`, {
    method: 'PUT',
    headers: {
      authorization: 'Bearer control-secret',
      'content-type': 'application/octet-stream',
    },
    body: releaseArchive('orders', 'release-1', '1.0.0'),
  });
  expect(wrongType.status).toBe(415);

  const cases: Array<{
    name: string;
    archive: Buffer;
    status: number;
    code: string;
  }> = [
    {
      name: 'invalid manifest',
      archive: tarGzip([
        { name: 'app-release.json', content: '{"version":' },
        {
          name: 'package.json',
          content: '{"name":"orders","version":"1.0.0"}',
        },
        { name: 'dist/server/embedded.js', content: 'export {}' },
      ]),
      status: 400,
      code: 'APP_RELEASE_ARCHIVE_INVALID',
    },
    {
      name: 'traversal',
      archive: tarGzip([{ name: '../escaped', content: 'unsafe' }]),
      status: 400,
      code: 'APP_RELEASE_ARCHIVE_INVALID',
    },
    {
      name: 'absolute path',
      archive: tarGzip([{ name: '/escaped', content: 'unsafe' }]),
      status: 400,
      code: 'APP_RELEASE_ARCHIVE_INVALID',
    },
    {
      name: 'backslash path',
      archive: tarGzip([{ name: 'dist\\escaped', content: 'unsafe' }]),
      status: 400,
      code: 'APP_RELEASE_ARCHIVE_INVALID',
    },
    {
      name: 'unexpected file',
      archive: tarGzip([{ name: 'README.md', content: 'unsafe' }]),
      status: 400,
      code: 'APP_RELEASE_ARCHIVE_INVALID',
    },
    {
      name: 'duplicate entry',
      archive: tarGzip([
        { name: 'package.json', content: '{}' },
        { name: 'package.json', content: '{}' },
      ]),
      status: 400,
      code: 'APP_RELEASE_ARCHIVE_INVALID',
    },
    {
      name: 'symbolic link',
      archive: tarGzip([
        {
          name: 'dist/server/embedded.js',
          type: 'symlink',
          linkname: '/etc/passwd',
        },
      ]),
      status: 400,
      code: 'APP_RELEASE_ARCHIVE_INVALID',
    },
    {
      name: 'missing required artifact',
      archive: tarGzip([
        { name: 'app-release.json', content: '{}' },
        { name: 'package.json', content: '{}' },
      ]),
      status: 400,
      code: 'APP_RELEASE_ARCHIVE_INVALID',
    },
    {
      name: 'package name mismatch',
      archive: releaseArchive('orders', 'release-1', '1.0.0', {
        packageName: 'different-app',
      }),
      status: 400,
      code: 'APP_RELEASE_ARCHIVE_INVALID',
    },
    {
      name: 'package version mismatch',
      archive: releaseArchive('orders', 'release-1', '1.0.0', {
        packageVersion: '2.0.0',
      }),
      status: 400,
      code: 'APP_RELEASE_ARCHIVE_INVALID',
    },
    {
      name: 'artifact checksum mismatch',
      archive: releaseArchive('orders', 'release-1', '1.0.0', {
        artifactSha256: '0'.repeat(64),
      }),
      status: 409,
      code: 'APP_RELEASE_INTEGRITY_FAILED',
    },
  ];

  for (const testCase of cases) {
    const response = await uploadRelease(
      `${baseUrl}/__apps/orders/releases/release-1`,
      testCase.archive,
      { authorization: 'Bearer control-secret' },
    );
    expect(response.status).toBe(testCase.status);
    const payload = await response.json();
    expect(payload).toMatchObject({
      code: testCase.code,
    });
    if (testCase.name === 'invalid manifest') {
      expect(JSON.stringify(payload)).not.toContain('.uploads');
      expect(JSON.stringify(payload)).not.toContain(appsDir);
    }
    expect(await readdir(path.join(appsDir, '.uploads'))).toEqual([]);
  }

  await expect(
    readFile(path.join(appsDir, '..', 'escaped'), 'utf8'),
  ).rejects.toMatchObject({ code: 'ENOENT' });
});

it('enforces compressed, expanded, and entry-count limits while streaming', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-host-upload-limits-'),
  );
  tempDirs.push(appsDir);
  const uploader = new AppReleaseUploader({
    appsDir,
    limits: {
      maxCompressedBytes: 16 * 1024,
      maxExpandedBytes: 2 * 1024,
      maxEntries: 8,
    },
  });
  const archives = [
    tarGzip([
      { name: 'dist/server/embedded.js', content: randomBytes(20 * 1024) },
    ]),
    tarGzip([
      { name: 'dist/server/embedded.js', content: 'x'.repeat(3 * 1024) },
    ]),
    tarGzip(
      Array.from({ length: 9 }, (_, index) => ({
        name: `dist/file-${index}.txt`,
        content: '',
      })),
    ),
  ];

  for (const archive of archives) {
    const request = Readable.from([archive]) as Readable & {
      headers: Record<string, string>;
    };
    request.headers = {
      'content-type': 'application/vnd.nocobase.release+tar+gzip',
    };
    await expect(
      uploader.upload(
        request as unknown as Parameters<AppReleaseUploader['upload']>[0],
        'orders',
        'release-1',
      ),
    ).rejects.toMatchObject({
      code: 'APP_RELEASE_UPLOAD_LIMIT_EXCEEDED',
      status: 413,
    });
    expect(await readdir(path.join(appsDir, '.uploads'))).toEqual([]);
  }
});

interface ReleaseArchiveOptions {
  artifactSha256?: string;
  packageMarker?: string;
  packageName?: string;
  packageVersion?: string;
}

function releaseArchive(
  appId: string,
  releaseId: string,
  version: string,
  options: ReleaseArchiveOptions = {},
): Buffer {
  const embeddedSource = `
    export function createServer(scope) {
      return {
        fetch(request) {
          const url = new URL(request.url);
          return Response.json({
            authSecret: url.pathname === '/runtime-secret'
              ? scope.config?.authSecret
              : undefined,
            artifactValue: scope.config?.artifactValue,
          });
        },
      };
    }
  `;
  const artifactSha256 =
    options.artifactSha256 ??
    hashArtifact('server/embedded.js', embeddedSource);
  return tarGzip([
    {
      name: 'app-release.json',
      content: JSON.stringify({
        schemaVersion: 1,
        appId,
        releaseId,
        version,
        artifactSha256,
        createdAt: '2026-08-26T00:00:00.000Z',
      }),
    },
    {
      name: 'package.json',
      content: JSON.stringify({
        name: options.packageName ?? appId,
        version: options.packageVersion ?? version,
        type: 'module',
        marker: options.packageMarker,
        app: {
          config: {
            artifactValue: 'preserved',
          },
        },
      }),
    },
    {
      name: 'dist/server/embedded.js',
      content: embeddedSource,
    },
  ]);
}

function hashArtifact(relativePath: string, content: string): string {
  const hash = createHash('sha256');
  hash.update(relativePath);
  hash.update('\0');
  hash.update(content);
  hash.update('\0');
  return hash.digest('hex');
}

async function startHost(appsDir: string): Promise<AppHost> {
  const host = createAppHost({
    host: '127.0.0.1',
    port: 0,
    appDistDir: appsDir,
    controlToken: 'control-secret',
  });
  runningHosts.push(host);
  await host.start();
  return host;
}

function hostBaseUrl(host: AppHost): string {
  const address = host.server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('App host did not expose a TCP address');
  }
  return `http://127.0.0.1:${address.port}`;
}

function uploadRelease(
  url: string,
  archive: Buffer,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(url, {
    method: 'PUT',
    headers: {
      'content-type': 'application/vnd.nocobase.release+tar+gzip',
      ...headers,
    },
    body: archive,
  });
}

function tarGzip(entries: TarEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const content = Buffer.from(entry.content ?? '');
    const type = entry.type ?? 'file';
    const header = Buffer.alloc(512);
    writeText(header, 0, 100, entry.name);
    writeOctal(header, 100, 8, type === 'directory' ? 0o755 : 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, type === 'file' ? content.length : 0);
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] =
      type === 'directory' ? 0x35 : type === 'symlink' ? 0x32 : 0x30;
    writeText(header, 157, 100, entry.linkname ?? '');
    writeText(header, 257, 6, 'ustar');
    writeText(header, 263, 2, '00');
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeOctal(header, 148, 8, checksum);
    blocks.push(header);
    if (type === 'file') {
      blocks.push(content);
      const padding = (512 - (content.length % 512)) % 512;
      if (padding) {
        blocks.push(Buffer.alloc(padding));
      }
    }
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

function writeText(
  target: Buffer,
  offset: number,
  length: number,
  value: string,
): void {
  target.write(
    value,
    offset,
    Math.min(length, Buffer.byteLength(value)),
    'utf8',
  );
}

function writeOctal(
  target: Buffer,
  offset: number,
  length: number,
  value: number,
): void {
  const encoded = `${value.toString(8).padStart(length - 2, '0')}\0 `;
  target.write(encoded, offset, length, 'ascii');
}
