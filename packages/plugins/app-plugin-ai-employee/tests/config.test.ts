import { AppConfig } from '@nocobase/app-server/config';
import { describe, expect, it } from 'vitest';

import {
  type AIApplicationConfig,
  normalizeDisks,
  resolveAIEmployeeStorageDisk,
  resolveAIKnowledgeBaseStorageDisks,
} from '../server/config.js';
import { normalizeLLMServiceConfig } from '../server/manager/llm-service-config.js';

function storageConfig(
  shared?: readonly string[],
  employee?: readonly string[],
  knowledgeBase?: readonly string[],
): AIApplicationConfig {
  return {
    storage: { disk: shared },
    aiEmployee: { storage: { disk: employee } },
    aiKnowledgeBase: { storage: { disk: knowledgeBase } },
    llmServices: [],
  };
}

async function loadAIConfig(value: unknown): Promise<AppConfig> {
  const config = new AppConfig();
  if (value !== undefined) {
    config.load({
      name: 'test-config',
      read: async () => ({
        kind: 'map',
        value: value as Record<string, object>,
      }),
    });
  }
  await config.loadAll();
  config.mergeDefaults({
    ai: {
      storage: {},
      aiEmployee: { storage: {} },
      aiKnowledgeBase: { storage: {}, vectorDatabases: [], manifests: [] },
      llmServices: [],
    },
  });
  return config;
}

describe('AI application config', () => {
  it('defaults storage scopes, LLM services, and knowledge-base inputs', async () => {
    const config = await loadAIConfig(undefined);

    expect(config.get<AIApplicationConfig>('ai')!).toEqual({
      storage: {},
      aiEmployee: { storage: {} },
      aiKnowledgeBase: {
        storage: {},
        vectorDatabases: [],
        manifests: [],
      },
      llmServices: [],
    });
  });

  it('keeps knowledge-base list defaults when another nested option is configured', async () => {
    const config = await loadAIConfig({
      ai: { aiKnowledgeBase: { storage: { disk: ['local'] } } },
    });

    expect(config.get<AIApplicationConfig>('ai')!.aiKnowledgeBase).toEqual({
      storage: { disk: ['local'] },
      vectorDatabases: [],
      manifests: [],
    });
  });

  it('accepts complete services, custom model entries, and nested provider options', async () => {
    const config = await loadAIConfig({
      ai: {
        futureOption: { enabled: true },
        llmServices: [
          {
            name: 'openai',
            title: 'OpenAI',
            provider: 'openai',
            options: { credentials: { apiKey: '${OPENAI_API_KEY}' } },
            enabledModels: [{ label: 'GPT-4.1', value: 'gpt-4.1' }],
            modelOptions: { responseFormat: { type: 'json_schema' } },
            enabled: true,
            sort: 10,
          },
          {
            name: 'custom-model',
            provider: 'openai',
            enabledModels: [{ label: 'Custom model', value: 'custom-model' }],
          },
        ],
      },
    });

    expect(config.get<AIApplicationConfig>('ai')!).toMatchObject({
      futureOption: { enabled: true },
      llmServices: [
        {
          options: { credentials: { apiKey: '${OPENAI_API_KEY}' } },
          modelOptions: { responseFormat: { type: 'json_schema' } },
        },
        { enabledModels: [{ label: 'Custom model', value: 'custom-model' }] },
      ],
    });
  });

  it('accepts canonical knowledge-base vector databases and manifest sources', async () => {
    const config = await loadAIConfig({
      ai: {
        aiKnowledgeBase: {
          storage: { disk: ['local', 'archive'] },
          vectorDatabases: [
            {
              name: 'pgvector1',
              provider: 'NocobaseDefaultPGVectorProvider',
              databaseSpec: 'PGVector',
              connection: {
                host: '127.0.0.1',
                port: 5432,
                user: '${PG_VECTOR_USERNAME}',
                password: '${PG_VECTOR_PASSWORD}',
                database: 'nocobase',
                tableName: 'vectorRecords',
              },
              enabled: true,
            },
            {
              name: 'normalized-by-knowledge-base',
              connection: {
                host: 'database.internal',
                port: 5432,
                user: 'nocobase',
                database: 'nocobase',
                tableName: 'otherVectorRecords',
              },
            },
          ],
          manifests: [
            {
              disk: 'local',
              locations: [
                'preload/knowledge-base/manifest.yml',
                '/preload/knowledge-base/append.yml',
              ],
            },
          ],
        },
      },
    });

    expect(config.get<AIApplicationConfig>('ai')!.aiKnowledgeBase).toEqual({
      storage: { disk: ['local', 'archive'] },
      vectorDatabases: [
        {
          name: 'pgvector1',
          provider: 'NocobaseDefaultPGVectorProvider',
          databaseSpec: 'PGVector',
          connection: {
            host: '127.0.0.1',
            port: 5432,
            user: '${PG_VECTOR_USERNAME}',
            password: '${PG_VECTOR_PASSWORD}',
            database: 'nocobase',
            tableName: 'vectorRecords',
          },
          enabled: true,
        },
        {
          name: 'normalized-by-knowledge-base',
          connection: {
            host: 'database.internal',
            port: 5432,
            user: 'nocobase',
            database: 'nocobase',
            tableName: 'otherVectorRecords',
          },
        },
      ],
      manifests: [
        {
          disk: 'local',
          locations: [
            'preload/knowledge-base/manifest.yml',
            '/preload/knowledge-base/append.yml',
          ],
        },
      ],
    });
  });

  it('also rejects duplicate names before direct synchronization', () => {
    expect(() =>
      normalizeLLMServiceConfig([
        { name: 'openai', provider: 'openai' },
        { name: 'openai', provider: 'deepseek' },
      ]),
    ).toThrow('duplicate service name "openai"');
  });

  it('normalizes disk arrays without parsing comma-separated strings', () => {
    expect(normalizeDisks([' a ', '', 'a', 'b,c'])).toEqual(['a', 'b,c']);
  });

  it('resolves employee and knowledge base scopes independently', () => {
    const value = storageConfig(['a', 'b', 'c'], ['employee-a']);
    expect(resolveAIEmployeeStorageDisk(value, 'local')).toBe('employee-a');
    expect(resolveAIKnowledgeBaseStorageDisks(value, 'local')).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('falls back through shared storage to the application default disk', () => {
    expect(
      resolveAIEmployeeStorageDisk(storageConfig(['a', 'b']), 'local'),
    ).toBe('a');
    expect(
      resolveAIKnowledgeBaseStorageDisks(storageConfig(['a', 'b']), 'local'),
    ).toEqual(['a', 'b']);
    expect(resolveAIEmployeeStorageDisk(storageConfig(), 'local')).toBe(
      'local',
    );
    expect(
      resolveAIKnowledgeBaseStorageDisks(storageConfig(), 'local'),
    ).toEqual(['local']);
  });
});
