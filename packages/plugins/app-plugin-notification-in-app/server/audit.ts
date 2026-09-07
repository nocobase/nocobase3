import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { Context, MiddlewareHandler, Next } from 'hono';

/** Optional trusted host capability; importing this contract never loads audit. */
export interface InAppNotificationAuditBridge {
  http(declaration: { readonly action: string }): MiddlewareHandler;
  /** Called only with the existing server resolver's verified session identity. */
  withIdentity(
    context: Context,
    verifiedUserId: string | undefined,
    next: Next,
  ): Promise<void>;
}

export const inAppNotificationAuditToken: ServiceToken<InAppNotificationAuditBridge> =
  createServiceToken<InAppNotificationAuditBridge>(
    '@nocobase/notification-in-app/audit',
  );
