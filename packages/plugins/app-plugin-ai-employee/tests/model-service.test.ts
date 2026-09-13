import type { AIManager } from '@nocobase/ai-employee';
import { describe, expect, it, vi } from 'vitest';

import { ModelService } from '../server/service/model-service.js';

function createService(enabledModels: unknown): ModelService {
  return new ModelService({
    ai: {
      llmServiceManager: {
        getLLMService: vi.fn().mockResolvedValue({
          name: 'service',
          provider: 'provider',
          enabled: true,
          enabledModels,
        }),
      },
      llmProviderManager: {
        llmProviders: new Map([['provider', {}]]),
      },
    } as unknown as AIManager,
  });
}

describe('ModelService model validation', () => {
  it('accepts configured provider and custom models', async () => {
    for (const mode of ['provider', 'custom'] as const) {
      await expect(
        createService({ mode, models: [{ value: 'model' }] }).requireModel({
          model: { llmService: 'service', model: 'model' },
        }),
      ).resolves.toEqual({ llmService: 'service', provider: 'provider' });
    }
  });

  it('treats historical recommended mode as having no enabled models', async () => {
    await expect(
      createService({
        mode: 'recommended',
        models: [{ value: 'model' }],
      }).requireModel({
        model: { llmService: 'service', model: 'model' },
      }),
    ).rejects.toThrow('Model is not enabled: service/model');
  });
});
