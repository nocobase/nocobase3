import type { AIEmployeeAgentOptions } from './options.js';
import {
  createAgentService,
  type AgentService,
} from '../../service/agent-service.js';
import { createAIEmployeeAgentProviders } from './context.js';

export async function createAIEmployeeAgentService(
  options: AIEmployeeAgentOptions,
): Promise<AgentService> {
  const providers = await createAIEmployeeAgentProviders(options);
  return createAgentService(providers);
}

export * from './context.js';
export type { AIEmployeeAgentOptions } from './options.js';
export type { ModelRef as AIEmployeeAgentModelRef } from '../../../types.js';
