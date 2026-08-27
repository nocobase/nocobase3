import { mkdtemp, rm } from 'node:fs/promises';
import { Blob as NodeBlob } from 'node:buffer';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DatabaseManager } from '@nocobase/app-database';
import { createDriveManager, type NocoBaseDriveManager } from '@nocobase/drive';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createDatabaseFileStoreMock } = vi.hoisted(() => ({
  createDatabaseFileStoreMock: vi.fn(),
}));

vi.mock('../server/database-file-store.js', () => ({
  createDatabaseFileStore: createDatabaseFileStoreMock,
}));

import {
  FileObjectNotFoundError,
  FilesUnavailableError,
  InvalidFileInputError,
} from '../server/errors.js';
import { createFilesService } from '../server/files-service.js';
import type { FileRecord, FileStore } from '../server/types.js';

describe('createFilesService', () => {
  let storageRoot: string;
  let drive: NocoBaseDriveManager;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'nocobase-files-service-'));
    drive = createDriveManager(
      {
        default: 'local',
        links: {},
        disks: {
          local: {
            driver: 'fs',
            location: join(storageRoot, 'configured-local'),
            visibility: 'private',
          },
          archive: {
            driver: 'fs',
            location: join(storageRoot, 'configured-archive'),
            visibility: 'private',
          },
        },
      },
      { fakes: { location: storageRoot } },
    );
    drive.fake('local');
    drive.fake('archive');
    createDatabaseFileStoreMock.mockReset();
  });

  afterEach(async () => {
    drive.restore('local');
    drive.restore('archive');
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('selects default and explicit disks and writes safe generated keys', async () => {
    const files = createService(drive);
    const localDisk = drive.use('local');
    const localPut = vi.spyOn(localDisk, 'put');

    const stored = await files.put({
      filename: '../contracts\\Quarterly Report?.pdf',
      mimeType: 'application/pdf',
      content: 'report',
    });
    const archived = await files.put({
      filename: 'archive.txt',
      mimeType: 'text/plain',
      content: new Uint8Array([1, 2, 3]),
      disk: 'archive',
    });

    expect(stored).toMatchObject({
      disk: 'local',
      filename: 'Quarterly-Report.pdf',
      mimeType: 'application/pdf',
      size: 6,
    });
    expect(stored.key).toMatch(
      /^files\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-Quarterly-Report\.pdf$/,
    );
    expect(localPut).toHaveBeenCalledWith(
      stored.key,
      'report',
      expect.objectContaining({
        contentType: 'application/pdf',
        contentLength: 6,
      }),
    );
    expect(await localDisk.get(stored.key)).toBe('report');
    expect(archived.disk).toBe('archive');
    expect(
      new Uint8Array(
        await new Response(
          await files.open(createRecord(archived)),
        ).arrayBuffer(),
      ),
    ).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('streams Blob input without converting it to an extra byte buffer', async () => {
    const files = createService(drive);
    const disk = drive.use('local');
    const putStream = vi.spyOn(disk, 'putStream');

    const stored = await files.put({
      filename: 'stream.txt',
      mimeType: 'text/plain',
      content: new NodeBlob(['streamed']),
    });

    expect(putStream).toHaveBeenCalledOnce();
    expect(stored.size).toBe(8);
    expect(await disk.get(stored.key)).toBe('streamed');
  });

  it('opens and removes objects using the disk recorded on the file', async () => {
    const files = createService(drive);
    const stored = await files.put({
      filename: 'read.txt',
      mimeType: 'text/plain',
      content: 'read me',
      disk: 'archive',
    });
    const record = createRecord(stored);

    expect(await new Response(await files.open(record)).text()).toBe('read me');
    await files.removeObject(record);
    expect(await drive.use('archive').exists(stored.key)).toBe(false);
    await expect(files.removeObject(record)).resolves.toBeUndefined();
  });

  it('reports missing objects through a stable typed error', async () => {
    const files = createService(drive);

    await expect(
      files.open(
        createRecord({
          disk: 'local',
          key: 'files/missing.txt',
          filename: 'missing.txt',
          mimeType: 'text/plain',
          size: 0,
        }),
      ),
    ).rejects.toBeInstanceOf(FileObjectNotFoundError);
  });

  it('reports a missing Drive and unavailable disks', async () => {
    const unavailable = createFilesService({
      publicBasePath: '/',
      defaultDisk: 'local',
      tokenSecret: 'secret',
    });
    const files = createService(drive);

    await expect(
      unavailable.put({ filename: 'a.txt', content: 'a' }),
    ).rejects.toBeInstanceOf(FilesUnavailableError);
    await expect(
      files.put({ filename: 'a.txt', content: 'a', disk: 'missing' }),
    ).rejects.toBeInstanceOf(FilesUnavailableError);
  });

  it('requires a size for streamed inputs', async () => {
    const files = createService(drive);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });

    await expect(
      files.put({ filename: 'stream.bin', content: stream }),
    ).rejects.toBeInstanceOf(InvalidFileInputError);
  });

  it('streams Web content when an explicit size is provided', async () => {
    const files = createService(drive);
    const disk = drive.use('local');
    const putStream = vi.spyOn(disk, 'putStream');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('web stream'));
        controller.close();
      },
    });

    const stored = await files.put({
      filename: 'web.txt',
      mimeType: 'text/plain',
      size: 10,
      content: stream,
    });

    expect(putStream).toHaveBeenCalledOnce();
    expect(stored.size).toBe(10);
    expect(await disk.get(stored.key)).toBe('web stream');
  });

  it('does not hide real driver deletion failures', async () => {
    const files = createService(drive);
    const disk = drive.use('local');
    vi.spyOn(disk, 'delete').mockRejectedValueOnce(new Error('driver failed'));

    await expect(
      files.removeObject(
        createRecord({
          disk: 'local',
          key: 'files/failure.txt',
          filename: 'failure.txt',
          mimeType: 'text/plain',
          size: 0,
        }),
      ),
    ).rejects.toMatchObject({
      name: 'FilesUnavailableError',
      cause: expect.objectContaining({ message: 'driver failed' }),
    });
  });

  it('normalizes empty, root, and nested public base paths exactly once', async () => {
    const cases = [
      ['', '/api/files/file-1/content'],
      ['/', '/api/files/file-1/content'],
      ['/apps/demo/', '/apps/demo/api/files/file-1/content'],
    ] as const;

    for (const [publicBasePath, expectedPath] of cases) {
      const files = createService(drive, publicBasePath);
      const access = await files.issueAccessUrl({
        audience: 'files',
        fileId: 'file-1',
        contentPath: '/api/files/file-1/content',
        expiresIn: 60,
      });

      expect(access.url.startsWith(`${expectedPath}?token=`)).toBe(true);
      expect(access.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }

    const nested = createService(drive, '/apps/demo');
    const access = await nested.issueAccessUrl({
      audience: 'files',
      fileId: 'file-1',
      contentPath: '/apps/demo/api/files/file-1/content',
    });
    expect(access.url.startsWith('/apps/demo/apps/demo/')).toBe(false);
  });

  it('issues and verifies access URLs and rejects unsupported content queries', async () => {
    const files = createService(drive, '/main');
    const access = await files.issueAccessUrl({
      audience: 'files',
      fileId: 'file-1',
      contentPath: '/api/files/file-1/content',
      expiresIn: 60,
    });
    const token = new URL(access.url, 'http://files.local').searchParams.get(
      'token',
    );

    await expect(
      files.verifyAccessToken({
        audience: 'files',
        fileId: 'file-1',
        token: token ?? '',
      }),
    ).resolves.toBeUndefined();
    await expect(
      files.issueAccessUrl({
        audience: 'files',
        fileId: 'file-1',
        contentPath: '/api/files/file-1/content?download=1',
      }),
    ).rejects.toBeInstanceOf(InvalidFileInputError);
  });

  it('does not rewrite an existing deterministic fixture object', async () => {
    const files = createService(drive);
    const disk = drive.use('local');
    const put = vi.spyOn(disk, 'put');

    await files.ensureObject({
      key: 'files/demo.txt',
      filename: 'demo.txt',
      mimeType: 'text/plain',
      content: 'first',
    });
    await files.ensureObject({
      key: 'files/demo.txt',
      filename: 'demo.txt',
      mimeType: 'text/plain',
      content: 'second',
    });

    expect(put).toHaveBeenCalledOnce();
    expect(await disk.get('files/demo.txt')).toBe('first');
  });

  it('fails clearly without a database and otherwise delegates Store creation', () => {
    const withoutDatabase = createService(drive);
    expect(() =>
      withoutDatabase.createDatabaseStore({ table: 'files' }),
    ).toThrow(FilesUnavailableError);

    const store = createStoreStub();
    const database = {} as DatabaseManager;
    createDatabaseFileStoreMock.mockReturnValue(store);
    const files = createFilesService({
      database,
      drive,
      publicBasePath: '/',
      defaultDisk: 'local',
      tokenSecret: 'secret',
    });

    expect(files.createDatabaseStore({ table: 'files' })).toBe(store);
    expect(createDatabaseFileStoreMock).toHaveBeenCalledWith(database, {
      table: 'files',
    });
  });
});

function createService(drive: NocoBaseDriveManager, publicBasePath = '/') {
  return createFilesService({
    drive,
    publicBasePath,
    defaultDisk: 'local',
    tokenSecret: 'secret',
  });
}

function createRecord(
  stored: Pick<FileRecord, 'disk' | 'key' | 'filename' | 'mimeType' | 'size'>,
): FileRecord {
  return {
    id: 'file-1',
    ...stored,
    public: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function createStoreStub(): FileStore {
  return {
    list: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  };
}
