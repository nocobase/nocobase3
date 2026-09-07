import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { Context, MiddlewareHandler } from 'hono';

export interface AIEmployeeAuditScope {
  readonly appId: string;
  readonly securityScope?: string;
  readonly actor: { readonly type: string; readonly id?: string };
  readonly initiator?: { readonly type: string; readonly id?: string };
  readonly roleIds?: readonly string[];
  readonly operationId?: string;
  readonly requestId?: string;
  readonly runId?: string;
  readonly correlationId?: string;
}
type Trace = Omit<AIEmployeeAuditScope, 'actor' | 'initiator' | 'roleIds'>;
type Outcome = 'success' | 'failed' | 'denied' | 'accepted' | 'unknown';

/** Supplied only by trusted application composition; no audit package import is required. */
export interface AIEmployeeAuditBridge {
  readonly runtime: {
    current(): AIEmployeeAuditScope;
    runAuthenticated<T>(
      identity: {
        actor: AIEmployeeAuditScope['actor'];
        roleIds?: readonly string[];
      },
      callback: () => T,
    ): T;
    runChild<T>(
      identity: { actor: AIEmployeeAuditScope['actor'] },
      callback: () => T,
    ): T;
    runBackground<T>(
      trace: Trace,
      verify: (trace: Trace) => Promise<AIEmployeeAuditScope | undefined>,
      callback: () => Promise<T>,
    ): Promise<T>;
  };
  readonly collector: { captureScope(context: Context): void };
  readonly service: {
    http(declaration: { action: string }): MiddlewareHandler;
    bind(
      scope: AIEmployeeAuditScope,
      options: { producer: string },
    ): {
      record(
        event: {
          action: string;
          outcome: Outcome;
          target?: { resource: string; key?: string };
          details?: Readonly<Record<string, unknown>>;
        },
        options?: { idempotencyKey?: string },
      ): Promise<{
        readonly state:
          'committed' | 'pending-commit' | 'disabled' | 'excluded';
      }>;
    };
  };
}
export const aiEmployeeAuditToken: ServiceToken<AIEmployeeAuditBridge> =
  createServiceToken<AIEmployeeAuditBridge>('@nocobase/ai-employee/audit');
