import type { AgentProviderOverrides } from '../types.js';
import type { AIEmployeeAgentRuntimeOptions } from './runtime.js';
import { createAgentService, type AgentService } from '../agent-service.js';
import { createAIEmployeeAgentProviders } from './providers.js';

export async function createAIEmployeeAgentService(
  options: AIEmployeeAgentRuntimeOptions,
  overrides?: AgentProviderOverrides,
): Promise<AgentService> {
  const providers = await createAIEmployeeAgentProviders(options, overrides);
  return createAgentService(providers);
}

export * from './providers.js';
export type { AIEmployeeAgentRuntimeOptions as AIEmployeeAgentOptions } from './runtime.js';
export type { ModelRef as AIEmployeeAgentModelRef } from '../../types.js';
