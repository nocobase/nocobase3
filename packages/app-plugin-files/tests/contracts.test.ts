import { describe, expect, expectTypeOf, it } from 'vitest';

import type { FileUploadPlan } from '@nocobase/app-plugin-files/client';
import type {
  CreateBusinessFileResponse,
  FileReference,
} from '@nocobase/app-plugin-files/protocol';
import type {
  FileService,
  FilesRuntime,
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

  it('restricts upload plans to PUT byte transfers', () => {
    expectTypeOf<FileUploadPlan['upload']['method']>().toEqualTypeOf<'PUT'>();

    const plan: FileUploadPlan = {
      fileId: 'file-1',
      expiresAt: '2026-08-24T00:00:00.000Z',
      upload: {
        method: 'PUT',
        url: '/api/files/file-1/upload',
      },
    };

    expect(plan.upload.method).toBe('PUT');
  });

  it('keeps FileService and FilesRuntime public contracts narrow', () => {
    expectTypeOf<keyof FileService>().toEqualTypeOf<'createFileRoute'>();
    expectTypeOf<keyof FilesRuntime>().toEqualTypeOf<'dispose'>();
  });

  it('shares one normalized route protocol between server and client consumers', () => {
    expectTypeOf<CreateBusinessFileResponse>().toHaveProperty(
      'bindingCredential',
    );
    expectTypeOf<CreateBusinessFileResponse>().toHaveProperty('uploadPlan');
    expectTypeOf<FileReference['file']>().toHaveProperty('status');
  });
});
