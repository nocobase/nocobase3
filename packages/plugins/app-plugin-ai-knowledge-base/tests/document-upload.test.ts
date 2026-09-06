import type { FileStorage, FileStorageFactory } from '@nocobase/ai-employee';
import {
  DriveFileStorageFactory,
  FileMetadataPersistenceError,
} from '@nocobase/ai-employee';
import { describe, expect, it, vi } from 'vitest';

import {
  MAX_KNOWLEDGE_BASE_DOCUMENT_UPLOAD_SIZE_BYTES,
  KnowledgeBaseUploadError,
  SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS,
} from '../server/document-upload.js';
import { KnowledgeBaseDocumentManager } from '../server/managers/knowledge-base-document-manager.js';
import { KnowledgeBaseStorageManager } from '../server/managers/knowledge-base-storage-manager.js';
import { KnowledgeBaseDocumentService } from '../server/services/knowledge-base-document-service.js';
import type {
  KnowledgeBaseDocumentEntity,
  KnowledgeBaseEntity,
} from '../server/repository/index.js';

const base: KnowledgeBaseEntity = {
  id: 1,
  key: 'kb-local',
  name: 'Local',
  knowledgeBaseType: 'LOCAL',
  knowledgeBaseOuterId: 'outer',
  vectorStoreProvider: 'NocobaseLocalVectorStore',
  vectorStoreConfigKey: 'config',
  segmentOptions: { enabled: true, chunkSize: 6000, chunkOverlap: 0 },
  disk: 'local',
  enabled: true,
  documentCount: 0,
  characterCount: 0,
  aiEmployeeCount: 0,
};

function document(filename = 'report.pdf'): KnowledgeBaseDocumentEntity {
  return {
    id: 7,
    key: 'doc-key',
    title: filename,
    filename,
    extname: filename.slice(filename.lastIndexOf('.')).toLowerCase(),
    size: 3,
    mimetype: 'application/octet-stream',
    path: `documents/${filename}`,
    disk: 'local',
    meta: {},
    knowledgeBaseKey: base.key,
    indexStatus: 'PENDING',
    errorMessage: null,
    characterCount: 0,
    segmentCount: 0,
    segmentVersion: 0,
    segmentRevision: 0,
    segmentStatus: 'PENDING',
    segmentErrorMessage: null,
    segmentOptions: base.segmentOptions,
    enabled: true,
  };
}

function setup(
  options: {
    knowledgeBaseType?: KnowledgeBaseEntity['knowledgeBaseType'];
    write?: FileStorage<KnowledgeBaseDocumentEntity, never>['write'];
    dispatchError?: Error;
    statusUpdateError?: Error;
  } = {},
) {
  const currentBase = {
    ...base,
    knowledgeBaseType: options.knowledgeBaseType ?? 'LOCAL',
  };
  const documents = {
    update: options.statusUpdateError
      ? vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(options.statusUpdateError)
      : vi.fn().mockResolvedValue(undefined),
    find: vi.fn().mockResolvedValue([]),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  const write =
    options.write ??
    vi.fn(async ({ filename }) => ({
      id: 7,
      disk: 'local',
      key: `documents/${filename}`,
      filename,
      extname: filename.slice(filename.lastIndexOf('.')).toLowerCase(),
      size: 3,
      mimeType: 'application/octet-stream',
      entity: document(filename),
    }));
  const deleteObject = vi.fn().mockResolvedValue(undefined);
  const storage = {
    createDocumentStorage: vi.fn(() => ({ write, deleteObject })),
    writeDocument: vi.fn(async (_base, input) => {
      const fileStorage = { write, deleteObject };
      try {
        return await fileStorage.write(input as never);
      } catch (cause) {
        if (cause instanceof FileMetadataPersistenceError) {
          try {
            await fileStorage.deleteObject(cause.metadata.key);
          } catch {
            // The production storage manager logs this without replacing the original error.
          }
        }
        throw cause;
      }
    }),
  };
  const dispatcher = {
    dispatch: options.dispatchError
      ? vi.fn().mockRejectedValue(options.dispatchError)
      : vi.fn().mockResolvedValue(undefined),
  };
  const warningLogger = { warn: vi.fn() };
  const manager = new KnowledgeBaseDocumentManager(
    { update: vi.fn() } as never,
    documents as never,
    { destroy: vi.fn() } as never,
    { destroy: vi.fn() } as never,
    { require: vi.fn().mockResolvedValue(currentBase) } as never,
    storage as never,
    dispatcher,
    warningLogger,
  );
  return {
    manager,
    documents,
    dispatcher,
    storage,
    write,
    deleteObject,
    warningLogger,
  };
}

describe('knowledge base document upload manager', () => {
  it.each(SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS)(
    'accepts lowercase and uppercase %s uploads and dispatches once',
    async (extension) => {
      for (const filename of [
        `file${extension}`,
        `file${extension.toUpperCase()}`,
      ]) {
        const { manager, storage, dispatcher } = setup();
        const result = await manager.upload(base.key, {
          name: filename,
          bytes: new Uint8Array([1, 2, 3]),
        });
        expect(result.filename).toBe(filename);
        expect(storage.writeDocument).toHaveBeenCalledOnce();
        expect(dispatcher.dispatch).toHaveBeenCalledOnce();
      }
    },
  );

  it.each([
    ['.pdf', '.pdf'],
    ['.XLSX', '.xlsx'],
  ])(
    'preserves %s through real knowledge base storage and dispatches once',
    async (extension, expectedExtname) => {
      const storedObjects = new Map<string, Uint8Array>();
      const driveStorageFactory = new DriveFileStorageFactory({
        ['use']: () => ({
          put: vi.fn(async (key: string, content: Uint8Array) => {
            storedObjects.set(key, content);
          }),
          getStream: vi.fn(),
          getUrl: vi.fn(async (key: string) => `/storage/${key}`),
          delete: vi.fn(async (key: string) => {
            storedObjects.delete(key);
          }),
        }),
      });
      const documents = {
        create: vi.fn(async (values: Record<string, unknown>) => ({
          ...document(String(values.filename)),
          ...values,
        })),
        update: vi.fn().mockResolvedValue(undefined),
        find: vi.fn().mockResolvedValue([]),
        destroy: vi.fn().mockResolvedValue(undefined),
      };
      const storage = new KnowledgeBaseStorageManager(
        driveStorageFactory,
        documents as never,
        {} as never,
        ['local'],
      );
      const dispatcher = { dispatch: vi.fn().mockResolvedValue(undefined) };
      const manager = new KnowledgeBaseDocumentManager(
        { update: vi.fn() } as never,
        documents as never,
        { destroy: vi.fn() } as never,
        { destroy: vi.fn() } as never,
        { require: vi.fn().mockResolvedValue(base) } as never,
        storage,
        dispatcher,
        { warn: vi.fn() },
      );
      const originalFilename = `${'a'.repeat(140)}${extension}`;

      const result = await manager.upload(base.key, {
        name: originalFilename,
        bytes: new Uint8Array([1, 2, 3]),
      });

      expect(result.filename).toHaveLength(128);
      expect(result.filename.endsWith(extension)).toBe(true);
      expect(result.extname).toBe(expectedExtname);
      expect(result.path.endsWith(`-${result.filename}`)).toBe(true);
      expect(storedObjects.has(result.path)).toBe(true);
      expect(dispatcher.dispatch).toHaveBeenCalledOnce();
    },
  );
  it.each(['file.zip', 'file.rar', 'file.7z', 'file.png', 'file.exe', 'file'])(
    'rejects unsupported file %s without writing or dispatching',
    async (filename) => {
      const { manager, storage, dispatcher } = setup();
      await expect(
        manager.upload(base.key, {
          name: filename,
          bytes: new Uint8Array([1]),
        }),
      ).rejects.toMatchObject({
        code: 'UNSUPPORTED_FILE_TYPE',
        status: 415,
      } satisfies Partial<KnowledgeBaseUploadError>);
      expect(storage.writeDocument).not.toHaveBeenCalled();
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    },
  );

  it.each(['READONLY', 'EXTERNAL'] as const)(
    'rejects %s knowledge bases',
    async (knowledgeBaseType) => {
      const { manager, storage } = setup({ knowledgeBaseType });
      await expect(
        manager.upload(base.key, {
          name: 'report.pdf',
          bytes: new Uint8Array([1]),
        }),
      ).rejects.toMatchObject({
        code: 'LOCAL_KNOWLEDGE_BASE_REQUIRED',
        status: 400,
      });
      expect(storage.writeDocument).not.toHaveBeenCalled();
    },
  );
  it('maps a missing knowledge base to a structured 404', async () => {
    const { manager } = setup();
    Object.assign(manager, {
      knowledgeBases: {
        require: vi
          .fn()
          .mockRejectedValue(new Error('Knowledge base #missing not found')),
      },
    });
    await expect(
      manager.upload('missing', {
        name: 'report.pdf',
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toMatchObject({ code: 'KNOWLEDGE_BASE_NOT_FOUND', status: 404 });
  });

  it('maps storage failures to a structured 503', async () => {
    const { manager, storage } = setup();
    storage.writeDocument.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(
      manager.upload(base.key, {
        name: 'report.pdf',
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE', status: 503 });
  });

  it('rejects actual bytes over the server limit', async () => {
    const { manager, storage } = setup();
    const bytes = new Uint8Array(
      MAX_KNOWLEDGE_BASE_DOCUMENT_UPLOAD_SIZE_BYTES + 1,
    );
    await expect(
      manager.upload(base.key, { name: 'large.pdf', bytes }),
    ).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE', status: 413 });
    expect(storage.writeDocument).not.toHaveBeenCalled();
  });

  it('keeps a created document and sanitizes the error when dispatch fails', async () => {
    const dispatchError = new Error('broker credentials leaked');
    const { manager, documents, warningLogger } = setup({ dispatchError });
    const result = await manager.upload(base.key, {
      name: 'report.pdf',
      bytes: new Uint8Array([1, 2, 3]),
    });
    const errorMessage =
      'Vectorization could not be queued. Retry vectorization later.';
    expect(result).toMatchObject({
      id: 7,
      indexStatus: 'ERROR',
      errorMessage,
    });
    expect(JSON.stringify(result)).not.toContain('broker credentials');
    expect(documents.update).toHaveBeenLastCalledWith(
      { id: 7 },
      { indexStatus: 'ERROR', errorMessage },
    );
    expect(warningLogger.warn).toHaveBeenCalledWith(expect.any(String), {
      documentId: 7,
      error: dispatchError,
    });
  });

  it('returns the created document when dispatch and ERROR persistence both fail', async () => {
    const dispatchError = new Error('queue unavailable');
    const statusUpdateError = new Error('database unavailable');
    const { manager, warningLogger } = setup({
      dispatchError,
      statusUpdateError,
    });

    await expect(
      manager.upload(base.key, {
        name: 'report.pdf',
        bytes: new Uint8Array([1, 2, 3]),
      }),
    ).resolves.toMatchObject({
      id: 7,
      indexStatus: 'ERROR',
      errorMessage:
        'Vectorization could not be queued. Retry vectorization later.',
    });
    expect(warningLogger.warn).toHaveBeenLastCalledWith(expect.any(String), {
      documentId: 7,
      dispatchError,
      statusUpdateError,
    });
  });
});

describe('knowledge base storage compensation', () => {
  it('deletes the object and preserves the metadata error', async () => {
    const metadataError = new FileMetadataPersistenceError({
      disk: 'local',
      key: 'documents/report.pdf',
      filename: 'report.pdf',
      extname: '.pdf',
      size: 3,
      mimeType: 'application/pdf',
    });
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const storageManager = new KnowledgeBaseStorageManager(
      {
        create: () => ({
          disk: 'local',
          write: vi.fn().mockRejectedValue(metadataError),
          open: vi.fn(),
          openMetadata: vi.fn(),
          deleteObject,
        }),
      } as FileStorageFactory,
      {} as never,
      {} as never,
      ['local'],
    );
    await expect(
      storageManager.writeDocument(base, {
        filename: 'report.pdf',
        content: new Uint8Array([1, 2, 3]),
        metadataContext: {} as never,
      }),
    ).rejects.toBe(metadataError);
    expect(deleteObject).toHaveBeenCalledWith('documents/report.pdf');
  });

  it('preserves the metadata error when compensating deletion fails', async () => {
    const metadataError = new FileMetadataPersistenceError({
      disk: 'local',
      key: 'documents/report.pdf',
      filename: 'report.pdf',
      extname: '.pdf',
      size: 3,
      mimeType: 'application/pdf',
    });
    const warningLogger = { warn: vi.fn() };
    const storageManager = new KnowledgeBaseStorageManager(
      {
        create: () => ({
          disk: 'local',
          write: vi.fn().mockRejectedValue(metadataError),
          open: vi.fn(),
          openMetadata: vi.fn(),
          deleteObject: vi.fn().mockRejectedValue(new Error('delete failed')),
        }),
      } as FileStorageFactory,
      {} as never,
      {} as never,
      ['local'],
      warningLogger,
    );
    await expect(
      storageManager.writeDocument(base, {
        filename: 'report.pdf',
        content: new Uint8Array([1, 2, 3]),
        metadataContext: {} as never,
      }),
    ).rejects.toBe(metadataError);
    expect(warningLogger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        disk: 'local',
        path: 'documents/report.pdf',
      }),
    );
  });
});

describe('knowledge base document upload service', () => {
  it.each([
    MAX_KNOWLEDGE_BASE_DOCUMENT_UPLOAD_SIZE_BYTES - 1,
    MAX_KNOWLEDGE_BASE_DOCUMENT_UPLOAD_SIZE_BYTES,
  ])('allows file.size %s at or within the limit', async (size) => {
    const arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(1));
    const upload = vi.fn().mockResolvedValue(document());
    const service = new KnowledgeBaseDocumentService(
      { upload } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.upload({
        knowledgeBaseKey: base.key,
        file: { name: 'report.pdf', size, arrayBuffer },
      }),
    ).resolves.toMatchObject({ id: 7 });
    expect(arrayBuffer).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledOnce();
  });

  it('rejects file.size over the limit before arrayBuffer()', async () => {
    const arrayBuffer = vi.fn();
    const upload = vi.fn();
    const service = new KnowledgeBaseDocumentService(
      { upload } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.upload({
        knowledgeBaseKey: base.key,
        file: {
          name: 'large.pdf',
          size: MAX_KNOWLEDGE_BASE_DOCUMENT_UPLOAD_SIZE_BYTES + 1,
          arrayBuffer,
        },
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE', status: 413 });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});
