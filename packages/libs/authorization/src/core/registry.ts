import type { AuthorizationDecision, AuthorizationRequest } from './types.js';
import type { AuthorizationGrantService } from './grants.js';
import type { AccessConstraintService } from './constraints.js';

export interface AuthorizationRuntimeContext {
  readonly grants: AuthorizationGrantService;
  readonly constraints: AccessConstraintService;
}

export interface ResourceAuthorizationHandler<TParams = undefined> {
  resourceType: string;
  authorize(
    request: AuthorizationRequest<TParams>,
    context: AuthorizationRuntimeContext,
  ): Promise<AuthorizationDecision>;
}

interface StoredResourceAuthorizationHandler {
  resourceType: string;
  authorize(
    request: {
      principal: AuthorizationRequest['principal'];
      subjects?: AuthorizationRequest['subjects'];
      resource: AuthorizationRequest['resource'];
      action: string;
      params?: unknown;
    },
    context: AuthorizationRuntimeContext,
  ): Promise<AuthorizationDecision>;
}

export class ResourceHandlerRegistry {
  private readonly handlers = new Map<
    string,
    StoredResourceAuthorizationHandler
  >();

  add<TParams = undefined>(
    handler: ResourceAuthorizationHandler<TParams>,
  ): void {
    if (this.handlers.has(handler.resourceType)) {
      throw new Error(
        `Authorization resource handler already registered: ${handler.resourceType}`,
      );
    }
    this.handlers.set(handler.resourceType, {
      resourceType: handler.resourceType,
      authorize(request, context): Promise<AuthorizationDecision> {
        return handler.authorize(
          {
            ...request,
            params: request.params as TParams,
          } as AuthorizationRequest<TParams>,
          context,
        );
      },
    });
  }

  get(resourceType: string): StoredResourceAuthorizationHandler | undefined {
    return this.handlers.get(resourceType);
  }

  list(): string[] {
    return [...this.handlers.keys()].sort();
  }
}
