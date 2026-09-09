import type { AgentProviderOverrides } from '../types.js';
import type { AIEmployeeAgentOptions } from './options.js';
import { createAgentService, type AgentService } from '../agent-service.js';
import { createAIEmployeeAgentProviders } from './providers.js';

export async function createAIEmployeeAgentService(
  options: AIEmployeeAgentOptions,
  overrides?: AgentProviderOverrides,
): Promise<AgentService> {
  const providers = await createAIEmployeeAgentProviders(options, overrides);
  return createAgentService(providers);
}

export * from './providers.js';
export type { AIEmployeeAgentOptions } from './options.js';
export type { ModelRef as AIEmployeeAgentModelRef } from '../../types.js';
