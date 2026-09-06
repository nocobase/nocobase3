import { describe, expect, it, vi } from 'vitest';

import { VectorStoreManager } from '../server/managers/vector-store-manager.js';

const config = {
  vectorDatabaseKey: 'database',
  llmService: 'openai',
  embeddingModel: 'text-embedding',
  vectorStoreConfigHash: 'config-hash',
};

function setup(
  options: {
    knowledgeBase?: Record<string, unknown> | null;
    vectorDatabase?: Record<string, unknown> | null;
  } = {},
) {
  const knowledgeBase =
    options.knowledgeBase === undefined
      ? { key: 'kb', ...config }
      : options.knowledgeBase;
  const vectorDatabase =
    options.vectorDatabase === undefined
      ? {
          key: 'database',
          provider: 'pgvector',
          connectProps: { host: 'localhost' },
        }
      : options.vectorDatabase;
  const embedding = { kind: 'embedding' };
  const store = { kind: 'store' };
  const createEmbedding = vi.fn().mockResolvedValue(embedding);
  const createVectorStore = vi.fn().mockResolvedValue(store);
  const findKnowledgeBase = vi.fn().mockResolvedValue(knowledgeBase);
  const findVectorDatabase = vi.fn().mockResolvedValue(vectorDatabase);
  const manager = new VectorStoreManager(
    {
      llmProviderManager: { createEmbedding },
      features: {
        vectorDatabaseProvider: { createVectorStore },
      },
    } as never,
    { findOne: findKnowledgeBase } as never,
    { findOne: findVectorDatabase } as never,
  );
  return {
    manager,
    store,
    createEmbedding,
    createVectorStore,
    findKnowledgeBase,
    findVectorDatabase,
  };
}

describe('VectorStoreManager', () => {
  it('resolves inline configuration by knowledge base key', async () => {
    const context = setup();

    await expect(context.manager.get('kb')).resolves.toBe(context.store);
    expect(context.findKnowledgeBase).toHaveBeenCalledWith({ key: 'kb' });
    expect(context.findVectorDatabase).toHaveBeenCalledWith({
      key: 'database',
    });
    expect(context.createEmbedding).toHaveBeenCalledWith({
      llmService: 'openai',
      model: 'text-embedding',
    });
    expect(context.createVectorStore).toHaveBeenCalledWith(
      'pgvector',
      { kind: 'embedding' },
      { host: 'localhost' },
    );
  });

  it('shares stores by persisted vector config hash', async () => {
    const context = setup();
    context.findKnowledgeBase
      .mockResolvedValueOnce({ key: 'kb-1', ...config })
      .mockResolvedValueOnce({ key: 'kb-2', ...config });

    const first = await context.manager.get('kb-1');
    const second = await context.manager.get('kb-2');

    expect(second).toBe(first);
    expect(context.findKnowledgeBase).toHaveBeenCalledTimes(2);
    expect(context.createVectorStore).toHaveBeenCalledOnce();
  });

  it('removes rejected promises from the hash cache', async () => {
    const context = setup();
    context.createVectorStore
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(context.store);

    await expect(context.manager.get('kb')).rejects.toThrow('unavailable');
    await expect(context.manager.get('kb')).resolves.toBe(context.store);
    expect(context.createVectorStore).toHaveBeenCalledTimes(2);
  });

  it('reports missing knowledge bases, config, and vector databases', async () => {
    await expect(
      setup({ knowledgeBase: null }).manager.get('missing'),
    ).rejects.toThrow('Knowledge base missing not found');
    await expect(
      setup({
        knowledgeBase: { key: 'kb', ...config, llmService: null },
      }).manager.get('kb'),
    ).rejects.toThrow('Vector store config for knowledge base kb is missing');
    await expect(
      setup({ vectorDatabase: null }).manager.get('kb'),
    ).rejects.toThrow('Vector database database not found');
  });
});
