import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { MiddlewareHandler } from 'hono';

/** Optional trusted host capability; importing this contract never loads audit. */
export interface I18nAuditBridge {
  http(declaration: { readonly action: string }): MiddlewareHandler;
}

export const i18nAuditToken: ServiceToken<I18nAuditBridge> =
  createServiceToken<I18nAuditBridge>('@nocobase/i18n/audit');
