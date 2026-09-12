import { rm } from 'node:fs/promises';
import { Document } from '@langchain/core/documents';
import type { Caching } from '@nocobase/caching';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CachedDocumentLoader } from '../src/manager/document-loader/plugin/cached.js';

const cachedFiles: string[] = [];

afterEach(async () => {
  await Promise.all(
    cachedFiles.splice(0).map((filePath) => rm(filePath, { force: true })),
  );
});

describe('CachedDocumentLoader', () => {
  it('uses a filesystem-safe temporary filename for storage paths', async () => {
    const values = new Map<string, unknown>();
    const caching = {
      getCache: () => ({
        get: async <T>(key: string) => values.get(key) as T | undefined,
        set: async <T>(key: string, value: T) => {
          values.set(key, value);
          if (typeof value === 'string') cachedFiles.push(value);
        },
      }),
    } as unknown as Caching;
    const load = vi
      .fn()
      .mockResolvedValue([new Document({ pageContent: 'parsed content' })]);
    const loader = new CachedDocumentLoader(caching, {
      loader: { load },
      parserVersion: 'v1',
      parsedMimetype: 'text/plain',
      parsedFileExtname: 'txt',
      supports: () => true,
    });
    const file = {
      id: '384393772269568',
      disk: 'local',
      path: 'ai-files/384393772269568-AI-RAG.txt',
      filename: 'AI-RAG.txt',
      size: 10,
    };

    await expect(loader.load(file)).resolves.toMatchObject({
      fromCache: false,
      text: 'parsed content',
    });
    await expect(loader.load(file)).resolves.toMatchObject({
      fromCache: true,
      text: 'parsed content',
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(cachedFiles[0]).not.toContain('ai-files/');
  });
});
