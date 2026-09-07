import type { MiddlewareHandler } from 'hono';
import type { AIEmployeeAuditBridge } from './audit.js';
import { bindAIRequestAudit } from './audit-runtime.js';

/** Metadata is selected from declared routes, never from request bodies or model output. */
export function aiAuditDeclaration(
  bridge: AIEmployeeAuditBridge,
  declarations: ReadonlyMap<string, string>,
): MiddlewareHandler {
  return async (context, next) => {
    const path = context.req.path.slice(context.req.path.lastIndexOf('/') + 1);
    const action = declarations.get(`${context.req.method}:${path}`);
    if (!action) return next();
    return bridge.service.http({ action })(context, next);
  };
}

export function aiAuditIdentity(
  bridge: AIEmployeeAuditBridge,
): MiddlewareHandler {
  return async (context, next) => {
    const user = context.var.currentUser;
    if (user.id === 'anonymous') {
      bindAIRequestAudit(context.var.ctx, bridge);
      bridge.collector.captureScope(context);
      return next();
    }
    return bridge.runtime.runAuthenticated(
      { actor: { type: 'user', id: String(user.id) }, roleIds: user.roles },
      async () => {
        bindAIRequestAudit(context.var.ctx, bridge);
        bridge.collector.captureScope(context);
        await next();
      },
    );
  };
}
