import type {
  VectorDatabaseProvider,
  VectorStoreProvider,
} from '@nocobase/ai-employee';
import { describe, expect, it, vi } from 'vitest';

import { LocalVectorStoreProvider } from '../server/extensions/vector-store/local-provider.js';
import { KnowledgeBaseFeatureImpl } from '../server/features/knowledge-base-feature.js';
import { VectorDatabaseProviderFeatureImpl } from '../server/features/vector-database-provider-feature.js';
import { VectorStoreProviderFeatureImpl } from '../server/features/vector-store-provider-feature.js';

describe('knowledge base feature registries', () => {
  it('registers and dispatches vector database providers', async () => {
    const provider: VectorDatabaseProvider<{ host: string }, { kind: string }> =
      {
        validateConnectParams: vi.fn(),
        testConnection: vi.fn().mockResolvedValue({ success: true }),
        beforeCreate: vi.fn().mockResolvedValue({ status: 0 }),
        createVectorStore: vi.fn().mockResolvedValue({ kind: 'custom' }),
        dispose: vi.fn().mockResolvedValue(undefined),
      };
    const feature = new VectorDatabaseProviderFeatureImpl();
    feature.register({ name: 'custom', spec: 'Custom', provider });

    feature.validateConnectParams('custom', { host: 'localhost' });
    await expect(
      feature.testConnection('custom', { host: 'localhost' }),
    ).resolves.toEqual({ success: true });
    await expect(
      feature.beforeCreate('custom', { host: 'localhost' }),
    ).resolves.toEqual({ status: 0 });
    await expect(
      feature.createVectorStore('custom', {} as never, { host: 'localhost' }),
    ).resolves.toEqual({ kind: 'custom' });
    expect(feature.listProviders()).toEqual([
      { name: 'custom', spec: 'Custom', provider },
    ]);
    expect(() =>
      feature.validateConnectParams('missing', { host: 'localhost' }),
    ).toThrow('Vector database provider "missing" is not registered');
  });

  it('registers vector store providers and creates their services', async () => {
    const service = {
      getVectorStore: vi.fn(),
      search: vi.fn(),
    };
    const provider: VectorStoreProvider = {
      providerName: 'external',
      createVectorStoreService: vi.fn().mockResolvedValue(service),
    };
    const feature = new VectorStoreProviderFeatureImpl();
    feature.register(provider);

    expect(feature.providerNames).toEqual(['external']);
    await expect(
      feature.createVectorStoreService('external', [
        { key: 'tenant', value: 'acme' },
      ]),
    ).resolves.toBe(service);
    expect(() => feature.register(provider)).toThrow('override existing keys');
    expect(() => feature.createVectorStoreService('missing')).toThrow(
      'Vector store provider "missing" is not registered',
    );
  });

  it('returns inline config and groups local searches by inline fields', async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce([{ content: 'shared', metadata: {}, score: 0.8 }])
      .mockResolvedValueOnce([{ content: 'other', metadata: {}, score: 0.7 }]);
    const createVectorStoreService = vi.fn().mockResolvedValue({ search });
    const rows = [
      {
        key: 'kb-1',
        name: 'One',
        description: null,
        knowledgeBaseType: 'LOCAL',
        knowledgeBaseOuterId: 'outer-1',
        vectorStoreProvider: 'NocobaseLocalVectorStore',
        vectorDatabaseKey: 'database',
        llmService: 'openai',
        embeddingModel: 'small',
        enabled: true,
      },
      {
        key: 'kb-2',
        name: 'Two',
        knowledgeBaseType: 'LOCAL',
        knowledgeBaseOuterId: 'outer-2',
        vectorStoreProvider: 'NocobaseLocalVectorStore',
        vectorDatabaseKey: 'database',
        llmService: 'openai',
        embeddingModel: 'small',
        enabled: true,
      },
      {
        key: 'kb-3',
        name: 'Three',
        knowledgeBaseType: 'LOCAL',
        knowledgeBaseOuterId: 'outer-3',
        vectorStoreProvider: 'NocobaseLocalVectorStore',
        vectorDatabaseKey: 'database',
        llmService: 'openai',
        embeddingModel: 'large',
        enabled: true,
      },
    ];
    const feature = new KnowledgeBaseFeatureImpl(
      {
        features: { vectorStoreProvider: { createVectorStoreService } },
      } as never,
      { find: vi.fn().mockResolvedValue(rows) } as never,
      {
        mergeLocalSearchResults: vi.fn(async (items) => items),
      } as never,
    );

    await expect(feature.getKnowledgeBase(['kb-1'])).resolves.toEqual(
      rows.map((row) =>
        expect.objectContaining({
          key: row.key,
          vectorDatabaseKey: row.vectorDatabaseKey,
          llmService: row.llmService,
          embeddingModel: row.embeddingModel,
        }),
      ),
    );
    await feature.search({
      knowledgeBaseKeys: rows.map((row) => row.key),
      query: 'query',
    });

    expect(createVectorStoreService).toHaveBeenCalledTimes(2);
    expect(createVectorStoreService).toHaveBeenNthCalledWith(
      1,
      'NocobaseLocalVectorStore',
      [{ key: 'knowledgeBaseKey', value: 'kb-1' }],
    );
    expect(search).toHaveBeenNthCalledWith(
      1,
      'query',
      expect.objectContaining({
        filter: { knowledgeBaseOuterId: { in: ['outer-1', 'outer-2'] } },
      }),
    );
    expect(createVectorStoreService).toHaveBeenNthCalledWith(
      2,
      'NocobaseLocalVectorStore',
      [{ key: 'knowledgeBaseKey', value: 'kb-3' }],
    );
  });

  it('requires a knowledge base key and preserves remaining provider props as filters', async () => {
    const similaritySearchWithScore = vi.fn().mockResolvedValue([]);
    const get = vi.fn().mockResolvedValue({ similaritySearchWithScore });
    const provider = new LocalVectorStoreProvider({ get } as never);

    await expect(provider.createVectorStoreService()).rejects.toThrow(
      'Knowledge base key is required',
    );
    const service = await provider.createVectorStoreService([
      { key: 'knowledgeBaseKey', value: 'kb' },
      { key: 'tenant', value: 'acme' },
    ]);
    await service.search('query', { filter: { status: 'active' } });

    expect(get).toHaveBeenCalledWith('kb');
    expect(similaritySearchWithScore).toHaveBeenCalledWith('query', undefined, {
      tenant: 'acme',
      status: 'active',
    });
  });
});
