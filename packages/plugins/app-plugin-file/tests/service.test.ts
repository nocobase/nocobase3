import { mkdtemp, rm } from 'node:fs/promises';
import { Blob as NodeBlob } from 'node:buffer';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDriveManager, type NocoBaseDriveManager } from '@nocobase/drive';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FileObjectNotFoundError,
  FileUnavailableError,
  InvalidFileInputError,
} from '../server/errors.js';
import {
  issueFileAccessUrl,
  verifyFileAccessToken,
} from '../server/file-access.js';
import {
  openFileObject,
  putFileObject,
  removeFileObject,
} from '../server/file-storage.js';
import type { FileRecord } from '../server/types.js';

describe('file storage and access helpers', () => {
  let storageRoot: string;
  let drive: NocoBaseDriveManager;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'nocobase-file-service-'));
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
  });

  afterEach(async () => {
    drive.restore('local');
    drive.restore('archive');
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('selects default and explicit disks and writes safe generated keys', async () => {
    const storage = createStorage(drive);
    const localDisk = drive.use('local');
    const localPut = vi.spyOn(localDisk, 'put');

    const stored = await putFileObject(storage, {
      filename: '../contracts\\Quarterly Report?.pdf',
      mimeType: 'application/pdf',
      content: 'report',
    });
    const archived = await putFileObject(storage, {
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
      /^files\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/,
    );
    expect(stored.key).not.toContain('Quarterly');
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
          await openFileObject(drive, createRecord(archived)),
        ).arrayBuffer(),
      ),
    ).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('preserves Unicode display names without exposing them in storage keys', async () => {
    const stored = await putFileObject(createStorage(drive), {
      filename: '采购合同📄.pdf',
      mimeType: 'application/pdf',
      content: 'contract',
    });

    expect(stored.filename).toBe('采购合同📄.pdf');
    expect(stored.key).toMatch(/^files\/[0-9a-f-]+\.pdf$/u);
    expect(stored.key).not.toContain('采购');
  });

  it('streams Blob input without converting it to an extra byte buffer', async () => {
    const storage = createStorage(drive);
    const disk = drive.use('local');
    const putStream = vi.spyOn(disk, 'putStream');

    const stored = await putFileObject(storage, {
      filename: 'stream.txt',
      mimeType: 'text/plain',
      content: new NodeBlob(['streamed']),
    });

    expect(putStream).toHaveBeenCalledOnce();
    expect(stored.size).toBe(8);
    expect(await disk.get(stored.key)).toBe('streamed');
  });

  it('opens and removes objects using the disk recorded on the file', async () => {
    const storage = createStorage(drive);
    const stored = await putFileObject(storage, {
      filename: 'read.txt',
      mimeType: 'text/plain',
      content: 'read me',
      disk: 'archive',
    });
    const record = createRecord(stored);

    expect(await new Response(await openFileObject(drive, record)).text()).toBe(
      'read me',
    );
    await removeFileObject(drive, record);
    expect(await drive.use('archive').exists(stored.key)).toBe(false);
    await expect(removeFileObject(drive, record)).resolves.toBeUndefined();
  });

  it('reports missing objects through a stable typed error', async () => {
    await expect(
      openFileObject(
        drive,
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
    await expect(
      putFileObject(createStorage(undefined), {
        filename: 'a.txt',
        content: 'a',
      }),
    ).rejects.toBeInstanceOf(FileUnavailableError);
    await expect(
      putFileObject(createStorage(drive), {
        filename: 'a.txt',
        content: 'a',
        disk: 'missing',
      }),
    ).rejects.toBeInstanceOf(FileUnavailableError);
  });

  it('reports a missing default disk before writing', async () => {
    await expect(
      putFileObject(
        { drive, defaultDisk: '' },
        { filename: 'a.txt', content: 'a' },
      ),
    ).rejects.toBeInstanceOf(FileUnavailableError);
  });

  it('requires a size for streamed inputs', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });

    await expect(
      putFileObject(createStorage(drive), {
        filename: 'stream.bin',
        content: stream,
      }),
    ).rejects.toBeInstanceOf(InvalidFileInputError);
  });

  it('streams Web content when an explicit size is provided', async () => {
    const disk = drive.use('local');
    const putStream = vi.spyOn(disk, 'putStream');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('web stream'));
        controller.close();
      },
    });

    const stored = await putFileObject(createStorage(drive), {
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
    const disk = drive.use('local');
    vi.spyOn(disk, 'delete').mockRejectedValueOnce(new Error('driver failed'));

    await expect(
      removeFileObject(
        drive,
        createRecord({
          disk: 'local',
          key: 'files/failure.txt',
          filename: 'failure.txt',
          mimeType: 'text/plain',
          size: 0,
        }),
      ),
    ).rejects.toMatchObject({
      name: 'FileUnavailableError',
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
      const access = issueFileAccessUrl({
        tokenSecret: 'secret',
        publicBasePath,
        audience: 'files',
        fileId: 'file-1',
        contentPath: '/api/files/file-1/content',
        expiresIn: 60,
      });

      expect(access.url.startsWith(`${expectedPath}?token=`)).toBe(true);
      expect(access.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }

    const access = issueFileAccessUrl({
      tokenSecret: 'secret',
      publicBasePath: '/apps/demo',
      audience: 'files',
      fileId: 'file-1',
      contentPath: '/apps/demo/api/files/file-1/content',
    });
    expect(access.url.startsWith('/apps/demo/apps/demo/')).toBe(false);
  });

  it('issues and verifies access URLs and rejects unsupported content queries', async () => {
    const access = issueFileAccessUrl({
      tokenSecret: 'secret',
      publicBasePath: '/main',
      audience: 'files',
      fileId: 'file-1',
      contentPath: '/api/files/file-1/content',
      expiresIn: 60,
    });
    const token = new URL(access.url, 'http://files.local').searchParams.get(
      'token',
    );

    expect(() =>
      verifyFileAccessToken({
        tokenSecret: 'secret',
        audience: 'files',
        fileId: 'file-1',
        token: token ?? '',
      }),
    ).not.toThrow();
    expect(() =>
      issueFileAccessUrl({
        tokenSecret: 'secret',
        publicBasePath: '/main',
        audience: 'files',
        fileId: 'file-1',
        contentPath: '/api/files/file-1/content?download=1',
      }),
    ).toThrow(InvalidFileInputError);
  });

  it('reports missing Token signing infrastructure clearly', () => {
    expect(() =>
      issueFileAccessUrl({
        publicBasePath: '/',
        audience: 'files',
        fileId: 'file-1',
        contentPath: '/api/files/file-1/content',
      }),
    ).toThrow(FileUnavailableError);
  });
});

function createStorage(drive: NocoBaseDriveManager | undefined) {
  return {
    drive,
    defaultDisk: 'local',
  };
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
