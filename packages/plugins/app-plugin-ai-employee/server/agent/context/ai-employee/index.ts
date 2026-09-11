import type { AIEmployeeContextOptions } from './options.js';
import {
  createAgentService,
  type AgentService,
} from '../../service/agent-service.js';
import { createAIEmployeeAgentProviders } from './context.js';

export async function createAIEmployee(
  options: AIEmployeeContextOptions,
): Promise<AgentService> {
  const providers = await createAIEmployeeAgentProviders(options);
  return createAgentService(providers);
}

export * from './context.js';
export type { AIEmployeeContextOptions } from './options.js';
export type { ModelRef as AIEmployeeAgentModelRef } from '../../../types.js';
