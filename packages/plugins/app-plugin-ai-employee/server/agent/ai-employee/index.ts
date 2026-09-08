import type { AgentProviderOverrides } from '../types.js';
import type { AIEmployeeAgentRuntimeOptions } from './runtime.js';
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
  options: AIEmployeeAgentRuntimeOptions,
  overrides?: AgentProviderOverrides,
): Promise<AIEmployeeAgentService> {
  const { providers, facade } = await createAIEmployeeAgentProviders(
    options,
    overrides,
  );
  return { service: createAgentService(providers), facade };
}

export * from './providers.js';
export type { AIEmployeeAgentRuntimeOptions as AIEmployeeAgentOptions } from './runtime.js';
export type { ModelRef as AIEmployeeAgentModelRef } from '../../types.js';
