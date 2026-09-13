import { describe, expect, it, vi } from 'vitest';

import { LLMProvider } from '../src/llm-providers/provider.js';
import { LLMProviderManager } from '../src/manager/llm-provider/default.js';
import { SupportedModel } from '../src/manager/llm-provider/types.js';
import {
  DEFAULT_ENABLED_MODELS,
  normalizeEnabledModelsConfig,
  type LLMServiceManager,
} from '../src/manager/llm-service/types.js';
import type { LLMServiceEntity } from '../src/repository/index.js';

class TestProvider extends LLMProvider {
  createModel(): null {
    return null;
  }
}

function createManager(services: LLMServiceEntity[]): LLMProviderManager {
  const serviceManager = {
    listLLMServices: vi.fn().mockResolvedValue(services),
  } as unknown as LLMServiceManager;
  const manager = new LLMProviderManager(serviceManager);
  manager.registerLLMProvider('test', {
    title: 'Test provider',
    supportedModel: [SupportedModel.LLM],
    provider: TestProvider,
  });
  return manager;
}

function service(enabledModels: unknown): LLMServiceEntity {
  return {
    name: 'test-service',
    title: 'Test service',
    provider: 'test',
    options: {},
    enabledModels,
    enabled: true,
    sort: 0,
  } as LLMServiceEntity;
}

describe('LLMProviderManager model configuration', () => {
  it('lists provider metadata without an empty model recommendation field', () => {
    expect(createManager([]).listLLMProviders()).toEqual([
      {
        name: 'test',
        title: 'Test provider',
        supportedModel: [SupportedModel.LLM],
        supportWebSearch: false,
        webSearchModels: undefined,
      },
    ]);
  });

  it('defaults missing and historical configurations to provider mode', () => {
    expect(DEFAULT_ENABLED_MODELS).toEqual({ mode: 'provider', models: [] });
    expect(normalizeEnabledModelsConfig(undefined)).toEqual({
      mode: 'provider',
      models: [],
    });
    expect(
      normalizeEnabledModelsConfig({ mode: 'recommended', models: [] }),
    ).toEqual({ mode: 'provider', models: [] });
  });

  it.each([
    ['an empty legacy array', []],
    ['a missing configuration', undefined],
    [
      'a historical recommended configuration',
      { mode: 'recommended', models: [] },
    ],
    [
      'an invalid configuration',
      { mode: 'invalid', models: [{ value: 'ignored' }] },
    ],
  ])('treats %s as having no enabled models', async (_label, enabledModels) => {
    await expect(
      createManager([service(enabledModels)]).listAllEnabledModels(),
    ).resolves.toEqual([]);
  });

  it.each(['provider', 'custom'] as const)(
    'uses normalized models from %s mode',
    async (mode) => {
      await expect(
        createManager([
          service({
            mode,
            models: [
              { label: ' Model A ', value: ' model-a ' },
              { label: '', value: 'model-b' },
            ],
          }),
        ]).listAllEnabledModels(),
      ).resolves.toMatchObject([
        {
          llmService: 'test-service',
          enabledModels: [
            { label: 'Model A', value: 'model-a' },
            { label: 'model-b', value: 'model-b' },
          ],
        },
      ]);
    },
  );
});
