import type { AIEmployeeOptions } from './runtime.js';
import { createAgentService, type AgentService } from '../agent-service.js';
import {
  createAIEmployeeAgentProviders,
  type AIEmployeeAgentFacade,
} from './providers.js';

export interface AIEmployeeAgentService {
  service: AgentService;
  facade: AIEmployeeAgentFacade;
}

export async function createAIEmployeeAgentService(
  options: AIEmployeeOptions,
  overrides?: import('../types.js').AgentProviderOverrides,
): Promise<AIEmployeeAgentService> {
  const { providers, facade } = await createAIEmployeeAgentProviders(
    options,
    overrides,
  );
  return { service: createAgentService(providers), facade };
}

export * from './providers.js';
export type {
  AIEmployeeOptions as AIEmployeeAgentOptions,
  ModelRef as AIEmployeeAgentModelRef,
} from './runtime.js';
