import { AIManager, MemoryRepositoryFactory } from '@nocobase/ai-employee';
import { describe, expect, it, vi } from 'vitest';

import {
  LLMServiceConfigSynchronizer,
  expandEnvironmentReferences,
} from '../server/llm-service-config.js';

function createManager(): AIManager {
  return new AIManager({ repositories: new MemoryRepositoryFactory() });
}

describe('LLMServiceConfigSynchronizer', () => {
  it('expands environment references recursively and normalizes enabled models', async () => {
    const previous = process.env.AI_CONFIG_TEST_KEY;
    process.env.AI_CONFIG_TEST_KEY = 'secret-value';
    const ai = createManager();

    try {
      await new LLMServiceConfigSynchronizer(ai.llmServiceManager).synchronize([
        {
          name: 'openai',
          provider: 'openai',
          options: {
            apiKey: '${AI_CONFIG_TEST_KEY}',
            nested: { missing: '${AI_CONFIG_MISSING}' },
          },
          enabledModels: [{ label: 'GPT-4.1', value: 'gpt-4.1' }],
        },
      ]);

      await expect(
        ai.llmServiceManager.getLLMService('openai'),
      ).resolves.toMatchObject({
        options: { apiKey: 'secret-value', nested: { missing: '' } },
        enabledModels: {
          mode: 'custom',
          models: [{ label: 'GPT-4.1', value: 'gpt-4.1' }],
        },
      });
    } finally {
      if (previous === undefined) delete process.env.AI_CONFIG_TEST_KEY;
      else process.env.AI_CONFIG_TEST_KEY = previous;
    }
  });

  it('updates definitions, preserves user state, and deletes stale services', async () => {
    const ai = createManager();
    await ai.llmServiceManager.registerLLMService({
      name: 'openai',
      title: 'Database title',
      provider: 'old-provider',
      options: { apiKey: 'old' },
      enabledModels: ['user-model'],
      modelOptions: { temperature: 0.5 },
      enabled: false,
      sort: 99,
    });
    await ai.llmServiceManager.registerLLMService({
      name: 'obsolete',
      provider: 'openai',
    });

    const summary = await new LLMServiceConfigSynchronizer(
      ai.llmServiceManager,
    ).synchronize([
      {
        name: 'openai',
        title: 'Configured title',
        provider: 'openai',
        options: { apiKey: 'configured' },
        enabledModels: [
          { label: 'Configured model', value: 'configured-model' },
        ],
        enabled: true,
        sort: 10,
      },
      {
        name: 'new',
        provider: 'deepseek',
        enabledModels: [{ label: 'New model', value: 'new-model' }],
        enabled: false,
      },
    ]);

    expect(summary).toEqual({
      configured: 2,
      created: 1,
      updated: 1,
      deleted: 1,
    });
    await expect(
      ai.llmServiceManager.getLLMService('openai'),
    ).resolves.toMatchObject({
      title: 'Configured title',
      provider: 'openai',
      options: { apiKey: 'configured' },
      modelOptions: {
        temperature: 1,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      sort: 10,
      enabled: false,
      enabledModels: {
        mode: 'custom',
        models: [{ label: 'user-model', value: 'user-model' }],
      },
    });
    await expect(
      ai.llmServiceManager.getLLMService('new'),
    ).resolves.toMatchObject({
      enabled: false,
      enabledModels: {
        mode: 'custom',
        models: [{ label: 'New model', value: 'new-model' }],
      },
    });
    await expect(
      ai.llmServiceManager.getLLMService('obsolete'),
    ).resolves.toBeUndefined();
  });

  it('treats a missing or empty service list as authoritative', async () => {
    const ai = createManager();
    await ai.llmServiceManager.registerLLMService({
      name: 'openai',
      provider: 'openai',
    });

    await new LLMServiceConfigSynchronizer(ai.llmServiceManager).synchronize(
      undefined,
    );

    await expect(ai.llmServiceManager.listLLMServices()).resolves.toEqual([]);
  });

  it('serializes rapid updates and leaves the latest snapshot active', async () => {
    const ai = createManager();
    const synchronizer = new LLMServiceConfigSynchronizer(ai.llmServiceManager);
    const first = synchronizer.enqueue([{ name: 'first', provider: 'openai' }]);
    const second = synchronizer.enqueue([
      { name: 'second', provider: 'deepseek' },
    ]);

    await Promise.all([first, second]);

    await expect(ai.llmServiceManager.listLLMServices()).resolves.toMatchObject(
      [{ name: 'second' }],
    );
  });

  it('does not expose service options in synchronization logs', async () => {
    const ai = createManager();
    const info = vi.fn();
    await new LLMServiceConfigSynchronizer(ai.llmServiceManager, {
      info,
    } as never).synchronize([
      { name: 'openai', provider: 'openai', options: { apiKey: 'secret' } },
    ]);

    expect(JSON.stringify(info.mock.calls)).not.toContain('secret');
    expect(info).toHaveBeenCalledWith(
      { configured: 1, created: 1, updated: 0, deleted: 0 },
      'AI LLM services synchronized from application config',
    );
  });
});

describe('expandEnvironmentReferences', () => {
  it('leaves non-string values unchanged', () => {
    expect(expandEnvironmentReferences({ enabled: true, count: 1 })).toEqual({
      enabled: true,
      count: 1,
    });
  });
});
