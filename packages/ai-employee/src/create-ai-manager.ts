import { anthropicProviderOptions } from './llm-providers/anthropic.js';
import { dashscopeProviderOptions } from './llm-providers/dashscope.js';
import { deepseekProviderOptions } from './llm-providers/deepseek/index.js';
import { googleGenAIProviderOptions } from './llm-providers/google-genai.js';
import { kimiProviderOptions } from './llm-providers/kimi/index.js';
import { mimoProviderOptions } from './llm-providers/mimo.js';
import { mistralProviderOptions } from './llm-providers/mistral.js';
import { ollamaProviderOptions } from './llm-providers/ollama.js';
import {
  openaiCompletionsProviderOptions,
  openaiResponsesProviderOptions,
} from './llm-providers/openai/index.js';
import { orcarouterProviderOptions } from './llm-providers/orcarouter.js';
import { shengsuanyunProviderOptions } from './llm-providers/shengsuanyun.js';
import { xaiProviderOptions } from './llm-providers/xai.js';
import { AIManager } from './manager/index.js';
import { MemoryRepositoryFactory } from './repository/memory/factory.js';
import type { RuntimeLogger } from './runtime/logger.js';

export function registerLLMProviders(ai: AIManager): void {
  ai.llmProviderManager.registerLLMProvider(
    'google-genai',
    googleGenAIProviderOptions,
  );
  ai.llmProviderManager.registerLLMProvider(
    'openai',
    openaiResponsesProviderOptions,
  );
  ai.llmProviderManager.registerLLMProvider(
    'anthropic',
    anthropicProviderOptions,
  );
  ai.llmProviderManager.registerLLMProvider(
    'deepseek',
    deepseekProviderOptions,
  );
  ai.llmProviderManager.registerLLMProvider(
    'dashscope',
    dashscopeProviderOptions,
  );
  ai.llmProviderManager.registerLLMProvider('kimi', kimiProviderOptions);
  ai.llmProviderManager.registerLLMProvider('mimo', mimoProviderOptions);
  ai.llmProviderManager.registerLLMProvider('mistral', mistralProviderOptions);
  ai.llmProviderManager.registerLLMProvider('ollama', ollamaProviderOptions);
  ai.llmProviderManager.registerLLMProvider(
    'openai-completions',
    openaiCompletionsProviderOptions,
  );
  ai.llmProviderManager.registerLLMProvider('xai', xaiProviderOptions);
  ai.llmProviderManager.registerLLMProvider(
    'orcarouter',
    orcarouterProviderOptions,
  );
  ai.llmProviderManager.registerLLMProvider(
    'shengsuanyun',
    shengsuanyunProviderOptions,
  );
}

/** Creates the framework-neutral manager aggregate with in-memory resource repositories. */
export function createAIManager(logger?: RuntimeLogger): AIManager {
  const ai = new AIManager({
    repositories: new MemoryRepositoryFactory(),
    mcpRuntime: { logger },
  });
  registerLLMProviders(ai);
  return ai;
}

/** Creates an AI manager with an injected repository factory for application adapters. */
export function createAIManagerWithRepositories(
  repositories: ConstructorParameters<typeof AIManager>[0]['repositories'],
  logger?: RuntimeLogger,
): AIManager {
  const ai = new AIManager({ repositories, mcpRuntime: { logger } });
  registerLLMProviders(ai);
  return ai;
}
