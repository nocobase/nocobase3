import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LLMServiceLoader } from '../loader/llm-service.js';
import { createMockServer } from './mock-server.js';

describe('LLM service loader', () => {
  const previousKey = process.env.AI_TEST_LLM_KEY;

  afterEach(() => {
    if (previousKey === undefined) delete process.env.AI_TEST_LLM_KEY;
    else process.env.AI_TEST_LLM_KEY = previousKey;
  });

  it('loads the models.json array into the repository-backed service manager', async () => {
    process.env.AI_TEST_LLM_KEY = 'expanded-test-key';
    const app = await createMockServer();
    const loader = new LLMServiceLoader(app.aiManager, {
      directory: path.resolve(process.cwd(), 'src/__tests__/resource/ai'),
    });

    await loader.load();

    await expect(
      app.aiManager.llmServiceManager.getLLMService('test-service'),
    ).resolves.toMatchObject({
      name: 'test-service',
      provider: 'openai',
      options: { apiKey: 'expanded-test-key' },
      enabledModels: ['gpt-test'],
    });
  });
});
