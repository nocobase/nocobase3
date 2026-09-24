import { describe, expect, it } from 'vitest';
import {
  DriveFileStorage,
  normalizeDisplayFilename,
  type FileMetadata,
  type NewFileMetadata,
} from '../src/index.js';

function storage() {
  const keys: string[] = [];
  const records: NewFileMetadata[] = [];
  const store = new DriveFileStorage<NewFileMetadata, void>({
    disk: 'local',
    prefix: 'ai-files',
    driveDisk: {
      put: async (key) => {
        keys.push(key);
      },
      getStream: async () => {
        throw new Error('not read here');
      },
      getUrl: async () => {
        throw new Error('no public URL');
      },
      delete: async () => undefined,
    },
    metadataRepository: {
      create: async (metadata) => {
        records.push(metadata);
        return {
          ...metadata,
          entity: metadata,
        } as FileMetadata<NewFileMetadata>;
      },
      findById: async () => null,
    },
  });
  return { store, keys, records };
}

describe('file names', () => {
  it('keeps a name in any script for the person, and a safe one for the storage key', async () => {
    const { store, keys, records } = storage();

    await store.write({
      id: '42',
      filename: '客户截图.PNG',
      content: new Uint8Array([1]),
      mimeType: 'image/png',
    });

    expect(records[0]).toMatchObject({
      filename: '客户截图.PNG',
      extname: '.png',
      key: 'ai-files/42-.PNG',
    });
    expect(keys).toEqual(['ai-files/42-.PNG']);
  });

  it('drops path segments and control characters from a display name', () => {
    expect(normalizeDisplayFilename('a/b\\报价单.pdf')).toBe('报价单.pdf');
    expect(normalizeDisplayFilename('\u0007提醒.txt')).toBe('提醒.txt');
    expect(normalizeDisplayFilename('  🙂 截图 (1).jpg ')).toBe(
      '🙂 截图 (1).jpg',
    );
    expect(normalizeDisplayFilename('   ')).toBe('file');
  });

  it('shortens a long display name by characters, keeping the extension', () => {
    const name = normalizeDisplayFilename(`${'图'.repeat(200)}.png`);
    expect([...name]).toHaveLength(128);
    expect(name.endsWith('.png')).toBe(true);
  });
});
