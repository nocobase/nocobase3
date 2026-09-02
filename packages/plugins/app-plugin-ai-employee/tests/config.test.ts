import { AppConfig } from '@nocobase/app-server/config';
import { describe, expect, it } from 'vitest';

import {
  aiConfig,
  normalizeDisks,
  resolveAIEmployeeStorageDisk,
  resolveAIKnowledgeBaseStorageDisks,
  type AIApplicationConfig,
} from '../server/config.js';
import { normalizeLLMServiceConfig } from '../server/llm-service-config.js';

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
  const config = new AppConfig([aiConfig], { context: {} });
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
  return config;
}

describe('AI application config', () => {
  it('defaults storage scopes and ai.llmServices', async () => {
    const config = await loadAIConfig(undefined);

    expect(config.get(aiConfig)).toEqual({
      storage: {},
      aiEmployee: { storage: {} },
      aiKnowledgeBase: { storage: {} },
      llmServices: [],
    });
  });

  it('accepts complete services, supported enabled-model forms, and nested provider options', async () => {
    const config = await loadAIConfig({
      ai: {
        futureOption: { enabled: true },
        llmServices: [
          {
            name: 'openai',
            title: 'OpenAI',
            provider: 'openai',
            options: { credentials: { apiKey: '${OPENAI_API_KEY}' } },
            enabledModels: ['gpt-4.1'],
            modelOptions: { responseFormat: { type: 'json_schema' } },
            enabled: true,
            sort: 10,
          },
          {
            name: 'provider-models',
            provider: 'openai',
            enabledModels: { mode: 'provider', models: [] },
          },
          {
            name: 'all-models',
            provider: 'openai',
            enabledModels: null,
          },
        ],
      },
    });

    expect(config.get(aiConfig)).toMatchObject({
      futureOption: { enabled: true },
      llmServices: [
        {
          options: { credentials: { apiKey: '${OPENAI_API_KEY}' } },
          modelOptions: { responseFormat: { type: 'json_schema' } },
        },
        { enabledModels: { mode: 'provider', models: [] } },
        { enabledModels: null },
      ],
    });
  });

  it.each([
    [{ ai: { llmServices: [{ provider: 'openai' }] } }, /name/],
    [{ ai: { llmServices: [{ name: 'openai' }] } }, /provider/],
    [
      {
        ai: {
          llmServices: [{ name: 'openai', provider: 'openai', sort: '1' }],
        },
      },
      /sort/,
    ],
  ])('rejects invalid service definitions', async (value, message) => {
    await expect(loadAIConfig(value)).rejects.toThrow(message);
  });

  it('rejects duplicate service names during application config validation', async () => {
    await expect(
      loadAIConfig({
        ai: {
          llmServices: [
            { name: 'openai', provider: 'openai' },
            { name: 'openai', provider: 'deepseek' },
          ],
        },
      }),
    ).rejects.toThrow(/uniqueItemProperties/);
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
