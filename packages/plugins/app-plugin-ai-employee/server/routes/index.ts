import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import { Hono, type MiddlewareHandler } from 'hono';
import type { AIEmployeePluginDeps } from '../bootstrap.js';
import {
  createPluginContextMiddleware,
  createPluginRuntime,
} from '../runtime.js';
import { createAIConversationsRouter } from './ai-conversations.js';
import { createAIEmployeeRouter } from './ai-employees.js';
import { createAIFilesRouter } from './ai-files.js';
import { createAIMCPServersRouter } from './ai-mcp-servers.js';
import { createAISkillsRouter } from './ai-skills.js';
import { createAIToolsRouter } from './ai-tools.js';
import { createAIRouter } from './ai.js';
import {
  createAICurrentUserMiddleware,
  createAIRequestMiddleware,
} from './utils.js';
import { createLLMServicesRouter } from './llm-services.js';

export * from './contracts.js';

export function registerAIEmployeeRoutes(
  routes: Hono,
  ...middlewares: MiddlewareHandler[]
): void {
  for (const middleware of middlewares) {
    routes.use('*', middleware);
  }
  routes.use('*', createAIRequestMiddleware());
  createAIRouter(routes);
  createAIEmployeeRouter(routes);
  createAIConversationsRouter(routes);
  createAIFilesRouter(routes);
  createAIToolsRouter(routes);
  createAISkillsRouter(routes);
  createLLMServicesRouter(routes);
  createAIMCPServersRouter(routes);
}

export default function registerRoutes({
  app,
  deps,
}: AppPluginRoutesContext<AIEmployeePluginDeps>): void {
  const routes = new Hono();
  const runtime = createPluginRuntime({ deps });
  registerAIEmployeeRoutes(
    routes,
    createAICurrentUserMiddleware(deps.auth),
    createPluginContextMiddleware(runtime),
  );
  app.route('/api/ai', routes);
}
