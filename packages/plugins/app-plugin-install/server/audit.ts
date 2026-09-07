import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { MiddlewareHandler } from 'hono';

/** Optional trusted host capability; importing this contract never loads audit. */
export interface InstallAuditBridge {
  /** Trusted deployment policy; absent/false preserves optional observation behavior. */
  readonly required?: boolean;
  http(declaration: { readonly action: string }): MiddlewareHandler;
  record(event: {
    readonly action: string;
    readonly outcome: 'accepted' | 'success' | 'failed';
    readonly details?: Readonly<Record<string, unknown>>;
  }): Promise<{
    readonly state: 'committed' | 'pending-commit' | 'disabled' | 'excluded';
  }>;
}

export const installAuditToken: ServiceToken<InstallAuditBridge> =
  createServiceToken<InstallAuditBridge>('@nocobase/install/audit');
