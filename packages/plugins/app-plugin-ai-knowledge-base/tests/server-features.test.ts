import type {
  VectorDatabaseProvider,
  VectorStoreProvider,
} from '@nocobase/ai-employee';
import { describe, expect, it, vi } from 'vitest';

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
});
