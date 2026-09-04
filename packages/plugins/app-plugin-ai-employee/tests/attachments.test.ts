import { describe, expect, it } from 'vitest';

import type { Context } from '../server/internal/runtime-context.js';
import {
  appendAIFileAttachmentSource,
  findMessageAttachments,
  getAttachmentSource,
  getMessageAttachmentLookupKey,
} from '../server/ai-employees/attachments.js';
type FindCall = { collectionName: string; filter: Record<string, unknown> };

function createContext(
  records: Record<string, unknown>[],
  calls: FindCall[] = [],
) {
  const repositories = {
    collectionRepository: (collectionName: string) => ({
      find: async ({ filter }: { filter: Record<string, unknown> }) => {
        calls.push({ collectionName, filter });
        return records;
      },
    }),
  };
  const context = {
    auth: { user: { id: 7 } },
    app: {},
  } as unknown as Context;
  return [context, repositories] as const;
}

function expectLookupKey(attachment: unknown, expected: string) {
  const lookupKey = getMessageAttachmentLookupKey(attachment as any);
  expect(lookupKey).toBe(expected);
  if (!lookupKey) throw new Error('lookup key is required');
  return lookupKey;
}

describe('message attachment lookup', () => {
  it('stores aiFiles attachment source in meta', () => {
    const attachment = { id: 1, meta: { foo: 'bar' } } as any;
    appendAIFileAttachmentSource(attachment);
    expect(attachment).toEqual({
      id: 1,
      meta: { foo: 'bar', source: { collectionName: 'aiFiles' } },
    });
  });

  it('skips historical attachments without source metadata', async () => {
    const calls: FindCall[] = [];
    const attachment = { id: 1, filename: 'upload.png' };
    const result = await findMessageAttachments(
      ...createContext([{ id: 1 }], calls),
      [attachment] as any,
    );
    expect(getMessageAttachmentLookupKey(attachment as any)).toBeNull();
    expect(result.size).toBe(0);
    expect(calls).toEqual([]);
  });

  it('loads uploaded aiFiles only for the current owner', async () => {
    const calls: FindCall[] = [];
    const attachment = {
      id: 1,
      filename: 'upload.png',
      source: { collectionName: 'aiFiles' },
    };
    const result = await findMessageAttachments(
      ...createContext([{ id: 1, filename: 'upload.png', disk: 1 }], calls),
      [attachment] as any,
    );
    expect(result.get(expectLookupKey(attachment, 'aiFiles:1'))).toMatchObject({
      id: 1,
      filename: 'upload.png',
    });
    expect(calls).toEqual([
      {
        collectionName: 'aiFiles',
        filter: { id: { $in: [1] }, createdById: 7 },
      },
    ]);
  });

  it('loads block attachments from their source collection without an owner filter', async () => {
    const calls: FindCall[] = [];
    const attachment = {
      id: 2,
      filename: 'block.pdf',
      source: { collectionName: 'attachments', field: 'orders.files' },
    };
    const result = await findMessageAttachments(
      ...createContext([{ id: 2, filename: 'block.pdf', disk: 1 }], calls),
      [attachment] as any,
    );
    expect(
      result.get(expectLookupKey(attachment, 'attachments:2')),
    ).toMatchObject({ id: 2, filename: 'block.pdf' });
    expect(calls).toEqual([
      { collectionName: 'attachments', filter: { id: { $in: [2] } } },
    ]);
  });

  it('skips trustworthy attachments and preserves normalized source fields', async () => {
    const calls: FindCall[] = [];
    const attachment = { id: 3, source: { trustworthy: true } };
    const result = await findMessageAttachments(
      ...createContext([{ id: 3 }], calls),
      [attachment] as any,
    );
    expect(result.size).toBe(0);
    expect(calls).toEqual([]);
    expect(
      getAttachmentSource({
        source: {
          collectionName: 'aiFiles',
          documentCache: false,
          trustworthy: true,
        },
      } as any),
    ).toEqual({
      collectionName: 'aiFiles',
      documentCache: false,
      trustworthy: true,
    });
  });
});
