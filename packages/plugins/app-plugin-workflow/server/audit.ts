import type { Context, MiddlewareHandler } from 'hono';
import type { TransactionHandle } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface WorkflowAuditPrincipal {
  readonly type: string;
  readonly id?: string;
}

/** Trusted persisted runtime context, never supplied by workflow input or queue payloads. */
export interface WorkflowAuditScope {
  readonly appId: string;
  readonly securityScope?: string;
  readonly actor: WorkflowAuditPrincipal;
  readonly initiator?: WorkflowAuditPrincipal;
  readonly roleIds?: readonly string[];
  readonly operationId?: string;
  readonly requestId?: string;
  readonly runId?: string;
  readonly correlationId?: string;
}

export interface WorkflowAuditContext {
  readonly scope: WorkflowAuditScope;
  readonly attempt: string;
}

/** Optional trusted host capability. Its declarations do not require the audit package. */
export interface WorkflowAuditBridge {
  readonly collector: { captureScope(context: Context): void };
  readonly runtime: {
    current(): WorkflowAuditScope;
    runBackground<T>(
      trace: Omit<WorkflowAuditScope, 'actor' | 'initiator' | 'roleIds'>,
      verify: (
        trace: Omit<WorkflowAuditScope, 'actor' | 'initiator' | 'roleIds'>,
      ) => Promise<WorkflowAuditScope | undefined>,
      callback: () => Promise<T>,
    ): Promise<T>;
  };
  readonly service: {
    bind(
      scope: WorkflowAuditScope,
      options: { readonly producer: string },
    ): {
      record(
        event: {
          readonly action: string;
          readonly outcome:
            'success' | 'failed' | 'denied' | 'accepted' | 'unknown';
          readonly target?: {
            readonly resource: string;
            readonly key?: string;
            readonly dataSource?: string;
          };
          readonly details?: Readonly<Record<string, unknown>>;
        },
        options?: {
          readonly transaction?: TransactionHandle;
          readonly idempotencyKey?: string;
        },
      ): Promise<{
        readonly state:
          'committed' | 'pending-commit' | 'disabled' | 'excluded';
      }>;
    };
    http(declaration: {
      readonly action: string;
      readonly target?: (
        context: Context,
      ) => { readonly resource: string; readonly key?: string } | undefined;
    }): MiddlewareHandler;
  };
}

export const workflowAuditToken: ServiceToken<WorkflowAuditBridge> =
  createServiceToken<WorkflowAuditBridge>('@nocobase/workflow/audit');
