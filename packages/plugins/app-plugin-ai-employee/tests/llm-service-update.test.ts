import { AIManager, MemoryRepositoryFactory } from '@nocobase/ai-employee';
import { describe, expect, it } from 'vitest';

import { LLMService } from '../server/service/llm-service.js';

async function createService() {
  const ai = new AIManager({ repositories: new MemoryRepositoryFactory() });
  await ai.llmServiceManager.registerLLMService({
    name: 'openai',
    title: 'OpenAI',
    provider: 'openai',
    options: { apiKey: 'configured-key', baseURL: 'https://api.test' },
    enabledModels: { mode: 'custom', models: [{ label: 'A', value: 'a' }] },
    enabled: true,
    sort: 3,
  });
  return { ai, service: new LLMService({ ai }) };
}

describe('LLMService narrow updates', () => {
  it('switches a service off without touching anything else', async () => {
    const { ai, service } = await createService();
    const before = await ai.llmServiceManager.getLLMService('openai');

    await expect(
      service.updateEnabled({
        input: {
          name: 'openai',
          enabled: false,
          provider: 'other',
          options: { baseURL: 'https://attacker.test' },
        },
      }),
    ).resolves.toMatchObject({ name: 'openai', enabled: false });
    expect(await ai.llmServiceManager.getLLMService('openai')).toEqual({
      ...before,
      enabled: false,
    });
  });

  it('replaces the model list without touching anything else', async () => {
    const { ai, service } = await createService();
    const before = await ai.llmServiceManager.getLLMService('openai');
    const enabledModels = {
      mode: 'provider' as const,
      models: [{ label: 'B', value: 'b' }],
    };

    await service.updateEnabledModels({
      input: { name: 'openai', enabledModels, enabled: false },
    });
    expect(await ai.llmServiceManager.getLLMService('openai')).toEqual({
      ...before,
      enabledModels,
    });
  });

  it('never creates a service', async () => {
    const { ai, service } = await createService();

    await expect(
      service.updateEnabled({
        input: { name: 'new', enabled: true, provider: 'openai' },
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.updateEnabledModels({
        input: { name: 'new', enabledModels: { mode: 'custom', models: [] } },
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await ai.llmServiceManager.getLLMService('new')).toBeUndefined();
  });

  it('rejects malformed bodies', async () => {
    const { service } = await createService();

    for (const input of [
      null,
      { enabled: true },
      { name: 'openai' },
      { name: 'openai', enabled: 'false' },
    ]) {
      await expect(service.updateEnabled({ input })).rejects.toMatchObject({
        status: 400,
      });
    }
    for (const input of [
      { name: 'openai' },
      { name: 'openai', enabledModels: ['a'] },
      { name: 'openai', enabledModels: { mode: 'other', models: [] } },
      { name: 'openai', enabledModels: { mode: 'custom' } },
    ]) {
      await expect(
        service.updateEnabledModels({ input }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });
});
