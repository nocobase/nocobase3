import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import type { MiddlewareHandler } from 'hono';

import { forbiddenError, type SkillsManagementActor } from '../types.js';

declare module 'hono' {
  interface ContextVariableMap {
    skillsManagementActor: SkillsManagementActor;
  }
}

export function requireSkillsManagement(): MiddlewareHandler<AuthorizationEnv> {
  return async (context, next) => {
    const authorization = context.get('authz');
    const permitted = await authorization.can({
      resource: { type: 'page', id: 'ai.settings' },
      action: 'access',
    });
    if (!permitted) {
      throw forbiddenError('AI settings access is required');
    }
    context.set('skillsManagementActor', {
      id: authorization.identity.principal.id,
      canReadAllSkills: true,
    });
    await next();
  };
}
