import { describe, expect, it } from 'vitest';
import { AIFileService } from '../src/app/service/file-service.js';
import { MemoryFileManager } from '../src/manager/file/index.js';

describe('AIFileService', () => {
  it('returns runtime preview URLs without persisting apiBasePath', async () => {
    let persistedValues: Record<string, unknown> | undefined;
    const fileManager = new MemoryFileManager();
    const service = new AIFileService(
      fileManager,
      { generate: () => '42' } as any,
      '/runtime/v2/api',
    );
    const repository = {
      find: async () => [],
      create: async ({ values }: { values: Record<string, unknown> }) => {
        persistedValues = values;
        return values;
      },
    };
    const ctx = {
      repositories: { aiFiles: repository },
      database: {
        transaction: async (callback: (connection: object) => unknown) =>
          callback({}),
      },
      currentUser: { id: 'user-1', roles: ['member'], isRoot: false },
    } as any;

    const result = await service.create(
      ctx,
      new File(['hello'], 'hello.txt', { type: 'text/plain' }),
    );

    expect(persistedValues).toMatchObject({
      id: '42',
      filename: 'hello.txt',
      path: '42',
    });
    expect(persistedValues).not.toHaveProperty('url');
    expect(persistedValues).not.toHaveProperty('preview');
    expect(JSON.stringify(persistedValues)).not.toContain('/runtime/v2/api');
    expect(result).toMatchObject({
      url: '/runtime/v2/api/aiFiles:preview?filterByTk=42',
      preview: '/runtime/v2/api/aiFiles:preview?filterByTk=42',
      data: {
        url: '/runtime/v2/api/aiFiles:preview?filterByTk=42',
        preview: '/runtime/v2/api/aiFiles:preview?filterByTk=42',
      },
    });
  });
});
