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
  /** Decision for an identity with unrestricted access. Omit it to permit the action outright. */
  authorizeUnrestricted?(
    request: AuthorizationRequest<TParams>,
  ): Promise<AuthorizationDecision>;
}

interface StoredResourceAuthorizationRequest {
  principal: AuthorizationRequest['principal'];
  subjects?: AuthorizationRequest['subjects'];
  resource: AuthorizationRequest['resource'];
  action: string;
  params?: unknown;
}

interface StoredResourceAuthorizationHandler {
  resourceType: string;
  authorize(
    request: StoredResourceAuthorizationRequest,
    context: AuthorizationRuntimeContext,
  ): Promise<AuthorizationDecision>;
  authorizeUnrestricted?(
    request: StoredResourceAuthorizationRequest,
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
    const authorizeUnrestricted = handler.authorizeUnrestricted?.bind(handler);
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
      ...(authorizeUnrestricted === undefined
        ? {}
        : {
            authorizeUnrestricted(request): Promise<AuthorizationDecision> {
              return authorizeUnrestricted({
                ...request,
                params: request.params as TParams,
              } as AuthorizationRequest<TParams>);
            },
          }),
    });
  }

  get(resourceType: string): StoredResourceAuthorizationHandler | undefined {
    return this.handlers.get(resourceType);
  }

  list(): string[] {
    return [...this.handlers.keys()].sort();
  }
}
