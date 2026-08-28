import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
      enabledModels: {
        mode: 'custom',
        models: [{ label: 'gpt-test', value: 'gpt-test' }],
      },
    });
  });

  it('can override an earlier manifest without preserving its user state', async () => {
    const app = await createMockServer();
    await app.aiManager.llmServiceManager.registerLLMService({
      name: 'runtime-service',
      provider: 'openai',
      enabled: false,
      enabledModels: ['packaged-model'],
    });
    await app.aiManager.llmServiceManager.registerLLMService({
      name: 'obsolete-service',
      provider: 'openai',
    });
    const directory = await mkdtemp(path.join(tmpdir(), 'llm-service-loader-'));
    await writeFile(
      path.join(directory, 'models.json'),
      JSON.stringify([
        {
          name: 'runtime-service',
          provider: 'deepseek',
          enabled: true,
          enabledModels: ['runtime-model'],
        },
      ]),
    );

    try {
      await new LLMServiceLoader(app.aiManager, {
        directory,
        preserveUserState: false,
        replaceExisting: true,
      }).load();

      await expect(
        app.aiManager.llmServiceManager.getLLMService('runtime-service'),
      ).resolves.toMatchObject({
        provider: 'deepseek',
        enabled: true,
        enabledModels: {
          mode: 'custom',
          models: [{ label: 'runtime-model', value: 'runtime-model' }],
        },
      });
      await expect(
        app.aiManager.llmServiceManager.getLLMService('obsolete-service'),
      ).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
