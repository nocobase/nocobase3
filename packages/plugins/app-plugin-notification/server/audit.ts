import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { MiddlewareHandler } from 'hono';

/** Optional trusted host capability; importing this contract never loads audit. */
export interface NotificationAuditBridge {
  http(declaration: { readonly action: string }): MiddlewareHandler;
}

export const notificationAuditToken: ServiceToken<NotificationAuditBridge> =
  createServiceToken<NotificationAuditBridge>('@nocobase/notification/audit');
