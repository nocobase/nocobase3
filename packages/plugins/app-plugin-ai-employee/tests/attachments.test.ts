import { describe, expect, it } from 'vitest';

import {
  appendAIFileAttachmentSource,
  findMessageAttachments,
  getAttachmentSource,
  getMessageAttachmentLookupKey,
  resolveMessageAttachments,
} from '../server/agent/context/ai-employee/attachments.js';
type FindCall = { collectionName: string; filter: Record<string, unknown> };

function createContext(
  records: Record<string, unknown>[],
  calls: FindCall[] = [],
) {
  const collectionRepository = (collectionName: string) => ({
    find: async ({ filter }: { filter: Record<string, unknown> }) => {
      calls.push({ collectionName, filter });
      return records;
    },
  });
  return { actorId: 7, collectionRepository } as const;
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
    const result = await findMessageAttachments({
      ...createContext([{ id: 1 }], calls),
      attachments: [attachment],
    });
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
    const result = await findMessageAttachments({
      ...createContext([{ id: 1, filename: 'upload.png', disk: 1 }], calls),
      attachments: [attachment],
    });
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
    const result = await findMessageAttachments({
      ...createContext([{ id: 2, filename: 'block.pdf', disk: 1 }], calls),
      attachments: [attachment],
    });
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
    const result = await findMessageAttachments({
      ...createContext([{ id: 3 }], calls),
      attachments: [attachment],
    });
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

  it('preserves the messages reference when there are no attachments', async () => {
    const calls: FindCall[] = [];
    const messages = [
      { role: 'user', content: { type: 'text', content: 'hello' } },
    ] as any;

    const result = await resolveMessageAttachments({
      ...createContext([], calls),
      messages,
    });

    expect(result).toBe(messages);
    expect(calls).toEqual([]);
  });

  it('replaces client attachment metadata with the owned aiFiles record', async () => {
    const calls: FindCall[] = [];
    const messages = [
      {
        role: 'user',
        content: { type: 'text', content: 'inspect this' },
        attachments: [
          {
            id: 1,
            filename: 'forged.png',
            mimetype: 'application/x-forged',
            path: 'forged-path',
            disk: 'forged-disk',
            url: 'https://example.com/forged',
            source: { collectionName: 'aiFiles' },
          },
        ],
      },
    ] as any;
    const canonical = {
      id: 1,
      filename: 'upload.png',
      mimetype: 'image/png',
      path: 'real-path',
      disk: 'local',
      url: '/storage/upload.png',
      createdById: 7,
    };

    const result = await resolveMessageAttachments({
      ...createContext([canonical], calls),
      messages,
    });

    expect(result[0].attachments).toEqual([
      {
        ...canonical,
        source: { collectionName: 'aiFiles' },
      },
    ]);
    expect(calls).toEqual([
      {
        collectionName: 'aiFiles',
        filter: { id: { $in: [1] }, createdById: 7 },
      },
    ]);
  });

  it('removes source attachments that cannot be resolved', async () => {
    const messages = [
      {
        role: 'user',
        content: { type: 'text', content: 'inspect this' },
        attachments: [{ id: 1, source: { collectionName: 'aiFiles' } }],
      },
    ] as any;

    const result = await resolveMessageAttachments({
      ...createContext([]),
      messages,
    });

    expect(result[0].attachments).toEqual([]);
  });

  it('preserves business attachment source metadata after hydration', async () => {
    const source = {
      collectionName: 'attachments',
      field: 'orders.files',
    };
    const messages = [
      {
        role: 'user',
        content: { type: 'text', content: 'inspect this' },
        attachments: [{ id: 2, path: 'forged-path', source }],
      },
    ] as any;

    const result = await resolveMessageAttachments({
      ...createContext([{ id: 2, path: 'real-path', disk: 'local' }]),
      messages,
    });

    expect(result[0].attachments).toEqual([
      { id: 2, path: 'real-path', disk: 'local', source },
    ]);
  });

  it('preserves trustworthy and historical attachments without querying', async () => {
    const calls: FindCall[] = [];
    const trustworthy = {
      id: 'internal',
      disk: 'memory',
      path: 'internal-path',
      source: { trustworthy: true },
    };
    const historical = {
      id: 'historical',
      disk: 'local',
      path: 'historical-path',
    };
    const messages = [
      {
        role: 'user',
        content: { type: 'text', content: 'inspect these' },
        attachments: [trustworthy, historical],
      },
    ] as any;

    const result = await resolveMessageAttachments({
      ...createContext([], calls),
      messages,
    });

    expect(result[0].attachments).toEqual([trustworthy, historical]);
    expect(calls).toEqual([]);
  });
});
