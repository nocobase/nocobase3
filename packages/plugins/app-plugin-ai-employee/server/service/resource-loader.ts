import { type AIManager } from '@nocobase/ai-employee';
import type { Logger } from '@nocobase/logging';

import type { AIResourceRegistrar } from '../ai/index.js';

export interface ResourceLoadSummary {
  readonly employees: number;
  readonly tools: number;
  readonly skills: number;
  readonly mcpServers: number;
  readonly llmServices: number;
}

export interface ResourceLoadOptions {
  readonly ai: AIManager;
  readonly logger: Logger;
  readonly resourceRegistrar: AIResourceRegistrar;
}

/** Runs the explicit registrar and reports the resulting manager state. */
export async function loadResources(
  options: ResourceLoadOptions,
): Promise<ResourceLoadSummary> {
  const { ai, logger, resourceRegistrar } = options;
  await resourceRegistrar.registerAIResources(ai);
  await ai.mcpServerManager.rebuildClient();

  const summary: ResourceLoadSummary = {
    employees: (await ai.employeeManager.listEmployees()).length,
    tools: (await ai.toolsManager.listTools({})).length,
    skills: (await ai.skillsManager.listSkills()).length,
    mcpServers: (await ai.mcpServerManager.listMCP({})).length,
    llmServices: (await ai.llmServiceManager.listLLMServices()).length,
  };
  logger.info?.(summary, 'AI resources loaded');
  return summary;
}
