import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import type { FileMetadata, FileStorage } from '@nocobase/ai-employee';

import { AIFileService } from '../server/service/file-service.js';
import type { AIFileEntity } from '../server/repository/ai-file.js';
import type { AIFileMetadataCreateContext } from '../server/file-storage/ai-file-metadata-repository.js';

const metadata: FileMetadata<AIFileEntity> = {
  id: '42',
  disk: 'local',
  key: 'ai-files/42-hello.txt',
  filename: 'hello.txt',
  extname: '.txt',
  size: 5,
  mimeType: 'text/plain',
  entity: {
    id: '42',
    disk: 'local',
    path: 'ai-files/42-hello.txt',
    filename: 'hello.txt',
    extname: '.txt',
    size: 5,
    mimetype: 'text/plain',
    createdById: 'user-1',
  },
};

describe('AIFileService', () => {
  it('returns runtime preview URLs without persisting apiBasePath', async () => {
    let input: unknown;
    const fileStorage: FileStorage<AIFileEntity, AIFileMetadataCreateContext> =
      {
        disk: 'local',
        write: async (value) => {
          input = value;
          return metadata;
        },
        open: async () => null,
        openMetadata: async () => ({
          metadata,
          stream: Readable.from(['hello']),
          contentType: 'text/plain',
        }),
      };
    const service = new AIFileService(
      fileStorage,
      { generate: () => '42' } as never,
      '/runtime/api/ai',
    );
    const ctx = {
      currentUser: { id: 'user-1', roles: ['member'], isRoot: false },
    } as never;

    const result = await service.create(
      ctx,
      new File(['hello'], 'hello.txt', { type: 'text/plain' }),
    );

    expect(input).toMatchObject({
      id: '42',
      objectId: '42',
      filename: 'hello.txt',
      metadataContext: { createdById: 'user-1' },
    });
    expect(result).toMatchObject({
      disk: 'local',
      path: 'ai-files/42-hello.txt',
      url: '/runtime/api/ai/aiFiles:preview?id=42',
      preview: '/runtime/api/ai/aiFiles:preview?id=42',
      data: {
        url: '/runtime/api/ai/aiFiles:preview?id=42',
        preview: '/runtime/api/ai/aiFiles:preview?id=42',
      },
    });
    expect(JSON.stringify(metadata.entity)).not.toContain('/runtime/api/ai');
  });

  it('checks ownership and streams previews from storage', async () => {
    const fileStorage: FileStorage<AIFileEntity, AIFileMetadataCreateContext> =
      {
        disk: 'local',
        write: async () => metadata,
        open: async () => ({
          metadata,
          stream: Readable.from([Buffer.from('hello')]),
          contentType: 'text/plain',
        }),
        openMetadata: async () => ({
          metadata,
          stream: Readable.from([Buffer.from('hello')]),
          contentType: 'text/plain',
        }),
      };
    const service = new AIFileService(
      fileStorage,
      { generate: () => '42' } as never,
      '/api/ai',
    );

    const forbidden = await service.preview(
      { currentUser: { id: 'other', roles: [], isRoot: false } } as never,
      '42',
    );
    expect(forbidden.status).toBe(403);

    const response = await service.preview(
      { currentUser: { id: 'user-1', roles: [], isRoot: false } } as never,
      '42',
    );
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('hello');
    expect(response.headers.get('content-type')).toBe('text/plain');
  });
});
