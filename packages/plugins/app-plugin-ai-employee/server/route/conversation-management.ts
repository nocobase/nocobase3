import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import type { MiddlewareHandler } from 'hono';

import { forbiddenError, type ConversationManagementActor } from '../types.js';

declare module 'hono' {
  interface ContextVariableMap {
    conversationManagementActor: ConversationManagementActor;
  }
}

export function requireConversationManagement(): MiddlewareHandler<AuthorizationEnv> {
  return async (context, next) => {
    const authorization = context.get('authz');
    // The frontend maps ai.settings/read to page ai.settings/access.
    const permitted = await authorization.can({
      resource: { type: 'page', id: 'ai.settings' },
      action: 'access',
    });
    if (!permitted) {
      throw forbiddenError('AI settings access is required');
    }
    context.set('conversationManagementActor', {
      id: authorization.identity.principal.id,
      canReadAllConversations: true,
    });
    await next();
  };
}
