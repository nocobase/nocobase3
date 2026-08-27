// @vitest-environment node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computeReleaseArtifactChecksum } from '../../server/hub/artifact-integrity.ts';
import {
  createHubDatabase,
  type HubDatabaseRuntime,
} from '../../server/hub/database.ts';
import { ReleaseUploadService } from '../../server/hub/release-upload-service.ts';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
let database: HubDatabaseRuntime;
let releaseRoot: string;

beforeEach(async () => {
  database = createHubDatabase({ filename: ':memory:' });
  await database.ready;
  releaseRoot = await mkdtemp(path.join(tmpdir(), 'nocobase-hub-uploads-'));
  temporaryDirectories.push(releaseRoot);
  await seedApplication();
});

afterEach(async () => {
  await database.close();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('ReleaseUploadService', () => {
  it('publishes an immutable release from an owned upload without exposing storageKey', async () => {
    const fixture = await createArchiveFixture();
    const service = new ReleaseUploadService(database.connection, {
      releaseRoot,
    });
    const actor = { userId: 'developer-1', credentialId: 'credential-1' };
    const credentialTime = new Date('2026-08-25T00:00:00.000Z');
    await database.connection.query
      .insertInto('hubAgentCredentials')
      .values({
        id: 'credential-1',
        userId: 'developer-1',
        clientId: 'nb-cli',
        clientName: 'Codex on Mac',
        accessTokenHash: 'access-hash',
        accessTokenExpiresAt: new Date('2026-08-25T01:00:00.000Z'),
        refreshTokenHash: 'refresh-hash',
        refreshTokenFamilyHash: 'family-hash',
        grantedScopes: JSON.stringify(['releases:publish']),
        applicationScope: JSON.stringify({
          mode: 'selected',
          applicationIds: ['app-1'],
        }),
        status: 'active',
        lastUsedAt: null,
        refreshTokenExpiresAt: new Date('2026-09-25T00:00:00.000Z'),
        revokedAt: null,
        createdAt: credentialTime,
        updatedAt: credentialTime,
      })
      .execute();

    const created = await service.create('app-1', fixture.input, actor);
    expect(created).toMatchObject({
      applicationId: 'app-1',
      status: 'created',
      version: '1.2.3',
    });
    expect(created).not.toHaveProperty('storageKey');

    await service.putContent(
      created.id,
      actor,
      await readFile(fixture.archive),
    );
    const started = await service.startCompletion(created.id, actor);
    expect(started.upload.status).toBe('verifying');
    expect(started.idempotent).toBe(false);

    const completed = await service.waitForCompletion(created.id);
    expect(completed).toMatchObject({
      id: created.id,
      status: 'completed',
      release: {
        applicationId: 'app-1',
        version: '1.2.3',
        checksum: fixture.input.checksum,
      },
    });
    expect(completed).not.toHaveProperty('storageKey');
    expect(completed).not.toHaveProperty('sourceCommit');
    expect(completed.release).not.toHaveProperty('storageKey');
    expect(completed.release).not.toHaveProperty('sourceCommit');
    const audit = await database.connection.query
      .selectFrom('hubAuditLogs')
      .select(['source', 'client'])
      .where('resourceId', '=', completed.release!.id)
      .executeTakeFirstOrThrow();
    expect(audit.source).toBe('agent');
    expect(JSON.parse(String(audit.client))).toEqual({
      credentialId: 'credential-1',
      name: 'Codex on Mac',
    });

    const row = await database.connection.query
      .selectFrom('hubReleases')
      .selectAll()
      .where('id', '=', completed.release!.id)
      .executeTakeFirstOrThrow();
    expect(String(row.storageKey)).toBe(
      path.posix.join('app-1', completed.release!.id),
    );
    await expect(
      stat(
        path.join(
          releaseRoot,
          String(row.storageKey),
          'dist/server/embedded.js',
        ),
      ),
    ).resolves.toMatchObject({ size: expect.any(Number) });

    await expect(
      service.startCompletion(created.id, actor),
    ).resolves.toMatchObject({
      upload: { status: 'completed' },
      idempotent: true,
    });
  });

  it('rejects secret files and link entries before they can enter release storage', async () => {
    const fixture = await createArchiveFixture({ includeSecret: true });
    const service = new ReleaseUploadService(database.connection, {
      releaseRoot,
    });
    const actor = { userId: 'developer-1', credentialId: null };
    const upload = await service.create('app-1', fixture.input, actor);
    await service.putContent(upload.id, actor, await readFile(fixture.archive));
    await service.startCompletion(upload.id, actor);

    await expect(service.waitForCompletion(upload.id)).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'RELEASE_ARCHIVE_SECRET_FILE' },
    });

    const linkFixture = await createArchiveFixture({ includeLink: true });
    const linkUpload = await service.create(
      'app-1',
      { ...linkFixture.input, version: '1.2.4' },
      actor,
    );
    await service.putContent(
      linkUpload.id,
      actor,
      await readFile(linkFixture.archive),
    );
    await service.startCompletion(linkUpload.id, actor);
    await expect(
      service.waitForCompletion(linkUpload.id),
    ).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'RELEASE_ARCHIVE_UNSUPPORTED_ENTRY' },
    });
  });

  it('validates archive bytes atomically and enforces upload ownership', async () => {
    const fixture = await createArchiveFixture();
    const service = new ReleaseUploadService(database.connection, {
      releaseRoot,
    });
    const owner = { userId: 'developer-1', credentialId: 'credential-1' };
    const other = { userId: 'developer-1', credentialId: 'credential-2' };
    const browser = { userId: 'developer-1', credentialId: null };
    const upload = await service.create('app-1', fixture.input, owner);

    await expect(
      service.putContent(upload.id, other, await readFile(fixture.archive)),
    ).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND', status: 404 });
    await expect(service.get(upload.id, other)).rejects.toMatchObject({
      code: 'UPLOAD_NOT_FOUND',
      status: 404,
    });
    await expect(
      service.startCompletion(upload.id, other),
    ).rejects.toMatchObject({
      code: 'UPLOAD_NOT_FOUND',
      status: 404,
    });
    await expect(service.cancel(upload.id, other)).rejects.toMatchObject({
      code: 'UPLOAD_NOT_FOUND',
      status: 404,
    });
    await expect(service.get(upload.id, browser)).rejects.toMatchObject({
      code: 'UPLOAD_NOT_FOUND',
      status: 404,
    });
    await expect(
      service.putContent(upload.id, browser, await readFile(fixture.archive)),
    ).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND', status: 404 });
    await expect(
      service.startCompletion(upload.id, browser),
    ).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND', status: 404 });
    await expect(service.cancel(upload.id, browser)).rejects.toMatchObject({
      code: 'UPLOAD_NOT_FOUND',
      status: 404,
    });

    const browserUpload = await service.create(
      'app-1',
      { ...fixture.input, version: '1.2.4' },
      browser,
    );
    await expect(
      service.putContent(
        browserUpload.id,
        owner,
        await readFile(fixture.archive),
      ),
    ).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND', status: 404 });
    await expect(
      service.startCompletion(browserUpload.id, owner),
    ).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND', status: 404 });
    await expect(
      service.putContent(upload.id, owner, Buffer.from('not-the-archive')),
    ).rejects.toMatchObject({
      code: 'UPLOAD_ARCHIVE_SIZE_MISMATCH',
      status: 422,
    });
    await expect(service.get(upload.id, owner)).resolves.toMatchObject({
      status: 'created',
    });

    await expect(service.cancel(upload.id, owner)).resolves.toMatchObject({
      upload: { status: 'cancelled' },
      idempotent: false,
    });
    await expect(service.cancel(upload.id, owner)).resolves.toMatchObject({
      upload: { status: 'cancelled' },
      idempotent: true,
    });
  });

  it('lets a browser admin observe or cancel an Agent upload without completing it', async () => {
    const fixture = await createArchiveFixture();
    const service = new ReleaseUploadService(database.connection, {
      releaseRoot,
    });
    const agent = { userId: 'developer-1', credentialId: 'credential-1' };
    const browserAdmin = {
      userId: 'owner-1',
      credentialId: null,
      isAdmin: true,
    };
    const upload = await service.create('app-1', fixture.input, agent);

    await expect(service.get(upload.id, browserAdmin)).resolves.toMatchObject({
      id: upload.id,
      status: 'created',
    });
    await expect(
      service.putContent(
        upload.id,
        browserAdmin,
        await readFile(fixture.archive),
      ),
    ).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND', status: 404 });
    await expect(
      service.startCompletion(upload.id, browserAdmin),
    ).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND', status: 404 });
    await expect(
      service.cancel(upload.id, browserAdmin),
    ).resolves.toMatchObject({
      upload: { status: 'cancelled' },
    });
  });
});

interface ArchiveFixture {
  archive: string;
  input: {
    version: string;
    checksum: string;
    sizeBytes: number;
    archiveChecksum: string;
    archiveSizeBytes: number;
    archiveFormat: 'tar.gz';
    manifest: Record<string, unknown>;
  };
}

async function createArchiveFixture(
  options: { includeSecret?: boolean; includeLink?: boolean } = {},
): Promise<ArchiveFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'nocobase-release-fixture-'));
  temporaryDirectories.push(root);
  const artifact = path.join(root, 'artifact');
  await mkdir(path.join(artifact, 'dist/server'), { recursive: true });
  await mkdir(path.join(artifact, 'dist/client'), { recursive: true });
  const manifest = {
    schemaVersion: 1,
    basePath: '/app-one',
    client: { rootDir: 'dist/client' },
    server: {
      entrypoint: 'dist/server/embedded.js',
      healthPath: '/api/healthz',
    },
  };
  await writeFile(
    path.join(artifact, 'nocobase-release.json'),
    `${JSON.stringify(manifest)}\n`,
  );
  await writeFile(
    path.join(artifact, 'dist/server/embedded.js'),
    'export default {};\n',
  );
  await writeFile(
    path.join(artifact, 'dist/client/index.html'),
    '<main>App</main>',
  );
  if (options.includeSecret) {
    await writeFile(
      path.join(artifact, 'dist/.env'),
      'DATABASE_PASSWORD=secret',
    );
  }
  if (options.includeLink) {
    await symlink(
      'embedded.js',
      path.join(artifact, 'dist/server/linked-entry.js'),
    );
  }
  const checksum = await computeReleaseArtifactChecksum(artifact).catch(
    async () => {
      if (!options.includeLink)
        throw new Error('Unable to compute fixture checksum.');
      await rm(path.join(artifact, 'dist/server/linked-entry.js'));
      const value = await computeReleaseArtifactChecksum(artifact);
      await symlink(
        'embedded.js',
        path.join(artifact, 'dist/server/linked-entry.js'),
      );
      return value;
    },
  );
  const archive = path.join(root, 'release.tar.gz');
  await execFileAsync('tar', ['-czf', archive, '-C', artifact, '.'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  const archiveBytes = await readFile(archive);
  return {
    archive,
    input: {
      version: '1.2.3',
      checksum,
      sizeBytes: await directorySize(artifact, options.includeLink ?? false),
      archiveChecksum: `sha256:${createHash('sha256').update(archiveBytes).digest('hex')}`,
      archiveSizeBytes: archiveBytes.byteLength,
      archiveFormat: 'tar.gz',
      manifest,
    },
  };
}

async function directorySize(
  root: string,
  ignoreLinks: boolean,
): Promise<number> {
  const { readdir } = await import('node:fs/promises');
  let total = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory())
      total += await directorySize(entryPath, ignoreLinks);
    else if (entry.isFile()) total += (await stat(entryPath)).size;
    else if (!ignoreLinks) total += (await stat(entryPath)).size;
  }
  return total;
}

async function seedApplication(): Promise<void> {
  const now = new Date('2026-08-25T00:00:00.000Z');
  await database.connection.query
    .insertInto('hubApplications')
    .values({
      id: 'app-1',
      slug: 'app-one',
      name: 'App One',
      description: null,
      status: 'active',
      isDefault: false,
      revision: 1,
      defaultEnvironmentId: 'default',
      activeReleaseId: null,
      createdBy: 'owner-1',
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}
