import type { Context, MiddlewareHandler } from 'hono';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

/** Trusted host composition only; never supply this capability to business handlers. */
export interface AuthenticationAuditBridge {
  readonly runtime: {
    runAuthenticated<T>(
      identity: {
        readonly actor: { readonly type: 'user'; readonly id: string };
      },
      callback: () => T,
    ): T;
    runAnonymous<T>(callback: () => T): T;
  };
  readonly collector: {
    http(declaration: AuthenticationAuditDeclaration): MiddlewareHandler;
    captureScope(context: Context): void;
  };
}

/** These producers declare neutral actions and never extract request data. */
export interface AuthenticationAuditDeclaration {
  readonly action: string;
  readonly titleKey?: string;
}

export const authenticationAuditToken: ServiceToken<AuthenticationAuditBridge> =
  createServiceToken<AuthenticationAuditBridge>(
    '@nocobase/authentication/audit',
  );
