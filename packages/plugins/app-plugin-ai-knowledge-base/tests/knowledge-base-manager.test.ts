import { describe, expect, it, vi } from 'vitest';

import { KnowledgeBaseManager } from '../server/managers/knowledge-base-manager.js';

const inlineConfig = {
  vectorDatabaseKey: 'database',
  llmService: 'openai',
  embeddingModel: 'text-embedding',
};

function createManager(initial?: Record<string, unknown>) {
  let row = initial ? { ...initial } : null;
  const create = vi.fn(async (values: Record<string, unknown>) => {
    row = { id: 1, ...values };
    return row;
  });
  const update = vi.fn(async (_filter, values: Record<string, unknown>) => {
    row = { ...row, ...values };
    return 1;
  });
  const findById = vi.fn(async () => row);
  const manager = new KnowledgeBaseManager(
    { create, update, findById } as never,
    { find: vi.fn().mockResolvedValue([]) } as never,
    ['private'],
  );
  return { manager, create, update, findById, getRow: () => row };
}

describe('KnowledgeBaseManager inline vector config', () => {
  it('creates built-in knowledge bases with inline config, hash, and one baseline time', async () => {
    const context = createManager();
    const created = await context.manager.create({
      name: 'Knowledge base',
      knowledgeBaseType: 'LOCAL',
      disk: 'private',
      ...inlineConfig,
    });

    expect(created).toMatchObject({
      ...inlineConfig,
      vectorStoreProvider: 'NocobaseLocalVectorStore',
      disk: 'private',
    });
    expect(created.vectorStoreConfigHash).toMatch(/^[a-f0-9]{64}$/);
    expect(created.vectorStoreUpdatedAt).toBeInstanceOf(Date);
    expect(created.confirmVectorStoreChanged).toBe(
      created.vectorStoreUpdatedAt,
    );
  });

  it.each(['LOCAL', 'READONLY'] as const)(
    'requires a complete inline config for %s knowledge bases',
    async (knowledgeBaseType) => {
      const context = createManager();
      await expect(
        context.manager.create({
          name: 'Incomplete',
          knowledgeBaseType,
          disk: 'private',
          vectorDatabaseKey: 'database',
          llmService: 'openai',
        }),
      ).rejects.toThrow('embeddingModel is required');
      expect(context.create).not.toHaveBeenCalled();
    },
  );

  it('does not retain inline vector config for external knowledge bases', async () => {
    const context = createManager();
    const created = await context.manager.create({
      name: 'External knowledge base',
      knowledgeBaseType: 'EXTERNAL',
      disk: 'private',
      vectorStoreProvider: 'ExternalVectorStore',
      ...inlineConfig,
    });

    expect(created).toMatchObject({
      vectorStoreProvider: 'ExternalVectorStore',
      vectorDatabaseKey: null,
      llmService: null,
      embeddingModel: null,
      vectorStoreConfigHash: null,
      vectorStoreUpdatedAt: null,
    });
  });

  it('clears inline config and replaces the built-in provider when switching to external', async () => {
    const context = createManager({
      id: 1,
      key: 'kb',
      knowledgeBaseType: 'LOCAL',
      vectorStoreProvider: 'NocobaseLocalVectorStore',
      disk: 'private',
      ...inlineConfig,
      vectorStoreConfigHash: 'old-hash',
      vectorStoreUpdatedAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    await context.manager.update(1, {
      knowledgeBaseType: 'EXTERNAL',
      vectorStoreProvider: 'ExternalVectorStore',
    });

    expect(context.getRow()).toMatchObject({
      knowledgeBaseType: 'EXTERNAL',
      vectorStoreProvider: 'ExternalVectorStore',
      vectorDatabaseKey: null,
      llmService: null,
      embeddingModel: null,
      vectorStoreConfigHash: null,
      vectorStoreUpdatedAt: null,
    });
  });

  it('updates the hash and timestamp only when inline config materially changes', async () => {
    const originalTime = new Date('2026-09-01T00:00:00.000Z');
    const context = createManager({
      id: 1,
      key: 'kb',
      name: 'Before',
      knowledgeBaseType: 'LOCAL',
      disk: 'private',
      ...inlineConfig,
      vectorStoreConfigHash: 'old-hash',
      vectorStoreUpdatedAt: originalTime,
    });

    await context.manager.update(1, { name: 'After' });
    expect(context.update).toHaveBeenLastCalledWith(
      { id: 1 },
      expect.not.objectContaining({
        vectorStoreConfigHash: expect.anything(),
        vectorStoreUpdatedAt: expect.anything(),
      }),
    );
    expect(context.getRow()).toMatchObject({
      name: 'After',
      vectorStoreConfigHash: 'old-hash',
      vectorStoreUpdatedAt: originalTime,
    });

    await context.manager.update(1, { embeddingModel: 'text-embedding-large' });
    expect(context.getRow()).toMatchObject({
      embeddingModel: 'text-embedding-large',
    });
    const changed = context.getRow() as Record<string, unknown>;
    expect(changed.vectorStoreConfigHash).toMatch(/^[a-f0-9]{64}$/);
    expect(changed.vectorStoreConfigHash).not.toBe('old-hash');
    expect(changed.vectorStoreUpdatedAt).toBeInstanceOf(Date);
    expect(changed.vectorStoreUpdatedAt).not.toBe(originalTime);

    const changedTime = changed.vectorStoreUpdatedAt;
    await context.manager.update(1, {
      embeddingModel: ' text-embedding-large ',
    });
    expect(
      (context.getRow() as Record<string, unknown>).vectorStoreUpdatedAt,
    ).toBe(changedTime);
  });
});
