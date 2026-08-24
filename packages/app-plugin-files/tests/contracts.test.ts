import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  executeFileUploadPlan,
  FileClientError,
  type FileClientOperation,
  type FileUploadPlan,
} from '@nocobase/app-plugin-files/client';
import type {
  CreateBusinessFileResponse,
  StoredFile,
} from '@nocobase/app-plugin-files/protocol';
import type {
  CreateFileInput,
  FileContentSource,
  FileService,
  FilesRuntime,
  OpenedFile,
} from '@nocobase/app-plugin-files/server';

describe('@nocobase/app-plugin-files contracts', () => {
  it('exposes importable package entry points', async () => {
    const [rootEntry, serverEntry, clientEntry] = await Promise.all([
      import('@nocobase/app-plugin-files'),
      import('@nocobase/app-plugin-files/server'),
      import('@nocobase/app-plugin-files/client'),
    ]);

    expect(rootEntry).toBeDefined();
    expect(serverEntry).toBeDefined();
    expect(clientEntry).toBeDefined();
    expect(Object.keys(serverEntry)).toContain('createFilesRuntime');
    expect(Object.keys(serverEntry)).toContain('createFileService');
    expect(Object.keys(clientEntry).sort()).toEqual([
      'FileClientError',
      'executeFileUploadPlan',
    ]);
    expect(Object.keys(serverEntry)).not.toEqual(
      expect.arrayContaining([
        'createFileKernel',
        'createFilesRepository',
        'createInternalFilesStorage',
        'FileKernel',
        'FilesRepository',
        'NodeLocalFilesStorage',
        'ProviderS3FilesStorage',
      ]),
    );
  });

  it('keeps internal server modules outside package exports and declarations', async () => {
    const packageJson = await import('../package.json', {
      with: { type: 'json' },
    });
    expect(Object.keys(packageJson.default.exports)).toEqual([
      '.',
      './server',
      './client',
      './protocol',
      './package.json',
    ]);
    expect(packageJson.default.files).toEqual(
      expect.arrayContaining([
        '!dist/server/internal/**/*.d.ts',
        '!dist/server/internal/**/*.d.ts.map',
      ]),
    );
  });

  it('restricts upload plans to PUT byte transfers', () => {
    expectTypeOf<FileUploadPlan['upload']['method']>().toEqualTypeOf<'PUT'>();

    const plan: FileUploadPlan = {
      fileId: 'file-1',
      expiresAt: '2026-08-24T00:00:00.000Z',
      upload: {
        method: 'PUT',
        url: '/api/files/file-1/upload',
      },
      complete: {
        method: 'POST',
        url: '/api/files/file-1/complete',
      },
      cancel: {
        method: 'DELETE',
        url: '/api/files/file-1/upload',
      },
    };

    expect(plan.upload.method).toBe('PUT');
  });

  it('publishes only the stable client helper, error, and protocol types', () => {
    expectTypeOf(executeFileUploadPlan).returns.toEqualTypeOf<
      Promise<import('@nocobase/app-plugin-files/protocol').StoredFile>
    >();
    expectTypeOf<FileClientOperation>().toEqualTypeOf<
      'upload' | 'complete' | 'cancel'
    >();
    expectTypeOf(FileClientError).toBeConstructibleWith('failed', {
      code: 'UPLOAD_FAILED',
      status: 409,
      operation: 'upload',
    });
  });

  it('keeps FileService and FilesRuntime public contracts narrow', () => {
    expectTypeOf<keyof FileService>().toEqualTypeOf<
      | 'createFileRoute'
      | 'createUpload'
      | 'createFile'
      | 'getFile'
      | 'getFiles'
      | 'openFile'
      | 'createTemporaryAccessUrl'
      | 'cancelUpload'
      | 'enablePublicAccess'
      | 'resetPublicAccess'
      | 'disablePublicAccess'
    >();
    expectTypeOf<keyof FilesRuntime>().toEqualTypeOf<'dispose'>();
    expectTypeOf<
      CreateFileInput['content']
    >().toEqualTypeOf<FileContentSource>();
    expectTypeOf<OpenedFile['stream']>().toEqualTypeOf<
      ReadableStream<Uint8Array>
    >();
  });

  it('shares one normalized route protocol between server and client consumers', () => {
    expectTypeOf<CreateBusinessFileResponse>().toHaveProperty('file');
    expectTypeOf<CreateBusinessFileResponse>().toHaveProperty('plan');
    expectTypeOf<StoredFile>().toHaveProperty('status');
  });
});
