import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { list } from 'tar';
import { afterEach, describe, expect, it } from 'vitest';

import {
  normalizeHubUrl,
  resolveHubReleaseUploadUrl,
  uploadReleaseArchive,
} from '../src/lib/hub-release-client.ts';
import { prepareReleaseArchive } from '../src/lib/release-artifact.ts';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

describe('release artifact packaging', () => {
  it('packages only deployable output with a stable content-based release id', async () => {
    const directory = await createAppFixture();
    const project = {
      directory,
      config: {
        name: 'crm',
        template: '@nocobase/app-template-default',
        templateVersion: '0.0.1',
      },
    };

    const first = await prepareReleaseArchive({
      project,
      packageManager: 'pnpm',
    });
    const second = await prepareReleaseArchive({
      project,
      packageManager: 'pnpm',
    });
    try {
      const entries: string[] = [];
      await list({
        file: first.archivePath,
        gzip: true,
        onReadEntry: (entry) => entries.push(entry.path),
      });

      expect(first.manifest.releaseId).toBe(second.manifest.releaseId);
      expect(first.manifest.releaseId).toMatch(
        /^release-1\.2\.3-[a-f0-9]{16}$/,
      );
      expect(entries).toContain('app-release.json');
      expect(entries).toContain('package.json');
      expect(entries).toContain('dist/server/embedded.js');
      expect(entries).toContain('dist/client/index.html');
      expect(entries.some((entry) => entry.startsWith('src/'))).toBe(false);
      expect(entries.some((entry) => entry.includes('.env'))).toBe(false);
      expect(entries.some((entry) => entry.startsWith('.git'))).toBe(false);
    } finally {
      await Promise.all([first.remove(), second.remove()]);
    }
  });

  it('uses an App release:pack script when one is provided', async () => {
    const directory = await createAppFixture({ releasePack: true });
    const prepared = await prepareReleaseArchive({
      project: {
        directory,
        config: {
          name: 'crm',
          template: '@nocobase/app-template-default',
          templateVersion: '0.0.1',
        },
      },
      packageManager: 'pnpm',
    });

    try {
      expect(prepared.manifest.version).toBe('9.9.9');
      expect(prepared.manifest.artifactSha256).toBe('a'.repeat(64));
    } finally {
      await prepared.remove();
    }
  });
});

describe('Hub artifact upload client', () => {
  it('normalizes Hub origins and API base paths without accepting credentials', () => {
    expect(
      resolveHubReleaseUploadUrl('http://localhost:13001', 'crm').href,
    ).toBe(
      'http://localhost:13001/hub/api/release-management/apps/crm/releases',
    );
    expect(
      resolveHubReleaseUploadUrl(
        'https://apps.example.com/hub/api',
        'sales portal',
      ).href,
    ).toBe(
      'https://apps.example.com/hub/api/release-management/apps/sales%20portal/releases',
    );
    expect(
      resolveHubReleaseUploadUrl('http://localhost:3000/crm', 'crm').href,
    ).toBe(
      'http://localhost:3000/hub/api/release-management/apps/crm/releases',
    );
    expect(() => normalizeHubUrl('ftp://apps.example.com')).toThrow(
      'Hub URL must use HTTP(S)',
    );
    expect(() =>
      normalizeHubUrl('https://user:secret@apps.example.com'),
    ).toThrow('without embedded credentials');
  });

  it('surfaces an unsuccessful Hub response as a failed deployment request', async () => {
    const directory = await createAppFixture();
    const archivePath = path.join(directory, 'release.tgz');
    await writeFile(archivePath, new Uint8Array([31, 139, 8, 0]));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      Response.json(
        {
          error: 'Deployment token is invalid',
          code: 'HUB_DEPLOY_TOKEN_INVALID',
        },
        { status: 401 },
      )) as typeof fetch;

    try {
      await expect(
        uploadReleaseArchive({
          hub: 'http://localhost:13001',
          token: 'wrong-token',
          archivePath,
          manifest: {
            schemaVersion: 1,
            appId: 'crm',
            releaseId: 'release-v1',
            version: '1.0.0',
            artifactSha256: 'a'.repeat(64),
          },
        }),
      ).rejects.toMatchObject({
        status: 401,
        code: 'HUB_DEPLOY_TOKEN_INVALID',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

async function createAppFixture(
  options: { releasePack?: boolean } = {},
): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nb3-release-test-'));
  tempDirs.push(directory);
  await mkdir(path.join(directory, 'dist', 'server'), { recursive: true });
  await mkdir(path.join(directory, 'dist', 'client'), { recursive: true });
  await mkdir(path.join(directory, 'src'), { recursive: true });
  await mkdir(path.join(directory, '.git'), { recursive: true });
  await writeFile(
    path.join(directory, 'dist', 'server', 'embedded.js'),
    'export const createServer = () => ({ fetch: () => new Response("ok") });\n',
  );
  await writeFile(
    path.join(directory, 'dist', 'client', 'index.html'),
    '<main>CRM</main>',
  );
  await writeFile(path.join(directory, 'src', 'private.ts'), 'source only\n');
  await writeFile(path.join(directory, '.env.local'), 'SECRET=never-upload\n');
  await writeFile(path.join(directory, '.git', 'config'), 'git metadata\n');
  await writeFile(
    path.join(directory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'crm',
        version: '1.2.3',
        type: 'module',
        ...(options.releasePack
          ? { scripts: { 'release:pack': 'node ./release-pack.mjs' } }
          : {}),
      },
      null,
      2,
    )}\n`,
  );
  if (options.releasePack) {
    await writeFile(
      path.join(directory, 'release-pack.mjs'),
      releasePackScript,
    );
  }
  return directory;
}

const releasePackScript = `
import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const releaseId = process.argv[process.argv.indexOf('--release-id') + 1];
const outputRoot = process.argv[process.argv.indexOf('--output-root') + 1];
const releaseRoot = path.join(outputRoot, 'crm', 'releases', releaseId);
await mkdir(releaseRoot, { recursive: true });
await cp('dist', path.join(releaseRoot, 'dist'), { recursive: true });
await writeFile(path.join(releaseRoot, 'app-release.json'), JSON.stringify({
  schemaVersion: 1,
  appId: 'crm',
  releaseId,
  version: '9.9.9',
  artifactSha256: 'a'.repeat(64),
}));
await writeFile(path.join(releaseRoot, 'package.json'), JSON.stringify({
  name: 'crm-packed',
  version: '9.9.9',
  type: 'module',
}));
`;
