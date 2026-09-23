import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import type { MiddlewareHandler } from 'hono';

import { forbiddenError } from '../types.js';

/**
 * The actions behind the AI settings page. Configuring AI is that page's job,
 * so a signed-in user who cannot open it can reach none of them. Chat actions
 * are deliberately absent: every signed-in user may talk to an employee.
 */
export const AI_SETTINGS_ACTIONS: readonly string[] = [
  'llmServices:list',
  'llmServices:get',
  'llmServices:updateEnabled',
  'llmServices:updateEnabledModels',
  'aiMcpServers:list',
  'aiMcpServers:get',
  'aiMcpServers:listTools',
  'aiMcpServers:testConnection',
  'aiMcpServers:updateEnabled',
  'aiMcpServers:updateToolPermission',
  'aiEmployees:list',
  'aiEmployees:get',
  'aiEmployees:getTemplates',
  'aiEmployees:create',
  'aiEmployees:update',
  'aiEmployees:destroy',
  'aiTools:list',
  'aiTools:get',
  'aiTools:create',
  'aiTools:update',
  'aiTools:destroy',
  'aiSkills:list',
  'aiSkills:get',
  'aiSkills:create',
  'aiSkills:update',
  'aiSkills:destroy',
  'ai:listProviderModels',
];

export function requireAISettingsAccess(): MiddlewareHandler<AuthorizationEnv> {
  return async (context, next) => {
    const permitted = await context.get('authz').can({
      resource: { type: 'page', id: 'ai.settings' },
      action: 'access',
    });
    if (!permitted) throw forbiddenError('AI settings access is required');
    await next();
  };
}
