import type { Hono } from 'hono';
import { createAIRouter } from './ai.router.js';
import { createAIConversationsRouter } from './ai-conversations.router.js';
import { createAIEmployeeRouter } from './ai-employees.router.js';
import { createAIFilesRouter } from './ai-files.router.js';
import { createAIMCPServersRouter } from './ai-mcp-servers.router.js';
import { createAISkillsRouter } from './ai-skills.router.js';
import { createAIToolsRouter } from './ai-tools.router.js';
import { createLLMServicesRouter } from './llm-services.router.js';

/** Registers each local AI action through its prefix-specific router. */
export function registerAIEmployeeRoutes(app: Hono, apiBasePath: string): void {
  createAIRouter(app, apiBasePath);
  createAIEmployeeRouter(app, apiBasePath);
  createAIConversationsRouter(app, apiBasePath);
  createAIFilesRouter(app, apiBasePath);
  createAIToolsRouter(app, apiBasePath);
  createAISkillsRouter(app, apiBasePath);
  createLLMServicesRouter(app, apiBasePath);
  createAIMCPServersRouter(app, apiBasePath);
}
