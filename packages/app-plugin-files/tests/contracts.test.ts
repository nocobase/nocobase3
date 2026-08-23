import { describe, expect, expectTypeOf, it } from 'vitest';

import type { FileUploadPlan } from '@nocobase/app-plugin-files/client';

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
});
