import fs from 'node:fs';
import path from 'node:path';

import {
  AIEmployeeLoader,
  MCPLoader,
  SkillsLoader,
  ToolsLoader,
  type AIManager,
} from '@nocobase/ai-employee';
import type { Logger } from '@nocobase/logging';

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
  readonly aiDirectory: string;
  readonly overrideTools?: boolean;
}

export async function loadResources(
  options: ResourceLoadOptions,
): Promise<ResourceLoadSummary> {
  const { ai, logger, aiDirectory, overrideTools = false } = options;
  const scan = (sub: string, pattern: string[]) => ({
    basePath: path.join(aiDirectory, sub),
    pattern,
  });

  await new ToolsLoader(ai, {
    overrideExisting: overrideTools,
    scan: scan('.', [
      '**/tools/**/*.ts',
      '**/tools/**/*.js',
      '!**/tools/**/*.d.ts',
      '**/tools/**/*/description.md',
    ]),
    logger,
  }).load();
  await new MCPLoader(ai, {
    scan: scan('.', ['mcp/*.ts', 'mcp/*.js', '!mcp/*.d.ts']),
    logger,
  }).load();
  await new SkillsLoader(ai, {
    scan: scan('.', ['**/skills/**/SKILLS.md']),
    logger,
  }).load();
  await new AIEmployeeLoader(ai, {
    scan: scan('.', [
      '**/employees/*.ts',
      '**/employees/*/index.ts',
      '**/employees/*.js',
      '**/employees/*/index.js',
      '**/employees/*/prompt.md',
      '!**/employees/**/*.d.ts',
    ]),
    logger,
  }).load();
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

export function resolveAIDirectory(explicit: string): string {
  const source = path.resolve(explicit);
  const dist = path.resolve(source, '..', 'dist', 'ai');
  if (
    fs.existsSync(path.join(dist, 'package.json')) &&
    fs.existsSync(path.join(dist, 'employees'))
  ) {
    return dist;
  }
  return source;
}
