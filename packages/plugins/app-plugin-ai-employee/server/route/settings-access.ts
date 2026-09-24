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

declare module 'hono' {
  interface ContextVariableMap {
    /** Whether the signed-in user can open the AI settings page, checked once. */
    canAccessAISettings: () => Promise<boolean>;
  }
}

/** Answers `canAccessAISettings` for the rest of the request, on first use. */
export function provideAISettingsAccess(): MiddlewareHandler<AuthorizationEnv> {
  return async (context, next) => {
    let permitted: Promise<boolean> | undefined;
    context.set(
      'canAccessAISettings',
      () =>
        (permitted ??= context.get('authz').can({
          resource: { type: 'page', id: 'ai.settings' },
          action: 'access',
        })),
    );
    await next();
  };
}

export function requireAISettingsAccess(): MiddlewareHandler<AuthorizationEnv> {
  return async (context, next) => {
    if (!(await context.get('canAccessAISettings')()))
      throw forbiddenError('AI settings access is required');
    await next();
  };
}
