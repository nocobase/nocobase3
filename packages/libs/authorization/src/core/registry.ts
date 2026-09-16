import type { AuthorizationDecision, AuthorizationRequest } from './types.js';
import type { AuthorizationGrantService } from './grants.js';
import type { AccessConstraintService } from './constraints.js';

export type ResourceTitle =
  string | { readonly key: string; readonly ns?: string };

export interface ResourceGroup {
  readonly id: string;
  readonly title: ResourceTitle;
  readonly children?: readonly ResourceGroup[];
}

export interface ResourceItem {
  readonly id: string;
  readonly title?: ResourceTitle;
  readonly description?: ResourceTitle;
  readonly group?: string;
  readonly actions: readonly string[];
}

export class ResourceGroups {
  private readonly entries = new Map<string, ResourceGroup>();
  private readonly ids = new Set<string>();

  add(group: ResourceGroup): void {
    const ids = new Set<string>();
    const visit = (node: ResourceGroup): void => {
      if (!node.id || ids.has(node.id) || this.ids.has(node.id)) {
        throw new Error(`Invalid or duplicate resource group: ${node.id}`);
      }
      ids.add(node.id);
      node.children?.forEach(visit);
    };
    visit(group);
    this.entries.set(group.id, structuredClone(group));
    ids.forEach((id) => this.ids.add(id));
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }
  list(): readonly ResourceGroup[] {
    return structuredClone([...this.entries.values()]);
  }
}

export class ResourceItems {
  private readonly entries = new Map<string, ResourceItem>();

  add(item: ResourceItem): void {
    if (!item.id || item.actions.length === 0)
      throw new Error('Resource items require an id and actions');
    if (this.entries.has(item.id))
      throw new Error(`Resource item already registered: ${item.id}`);
    this.entries.set(item.id, structuredClone(item));
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }
  list(): readonly ResourceItem[] {
    return structuredClone([...this.entries.values()]);
  }
}

/** Plugins augment this map to supply their resource-specific item registry. */
export interface AuthorizationResourceItems {
  page: ResourceItems;
}

export interface RegisteredResource<TItems = ResourceItems> {
  readonly resourceType: string;
  readonly groups: ResourceGroups;
  readonly items: TItems;
}

export interface AuthorizationRuntimeContext {
  readonly grants: AuthorizationGrantService;
  readonly constraints: AccessConstraintService;
}

export interface ResourceAuthorizationHandler<
  TParams = undefined,
  TItems = ResourceItems,
> {
  items?: TItems;
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
  private readonly registered = new Map<string, RegisteredResource<unknown>>();

  getResource<T extends keyof AuthorizationResourceItems>(
    type: T,
  ): RegisteredResource<AuthorizationResourceItems[T]>;
  getResource(type: string): RegisteredResource;
  getResource(type: string): RegisteredResource<unknown> {
    const resource = this.registered.get(type);
    if (!resource)
      throw new Error(`Authorization resource is not registered: ${type}`);
    return resource;
  }

  private readonly handlers = new Map<
    string,
    StoredResourceAuthorizationHandler
  >();

  add<TParams = undefined, TItems = ResourceItems>(
    handler: ResourceAuthorizationHandler<TParams, TItems>,
  ): void {
    if (this.handlers.has(handler.resourceType)) {
      throw new Error(
        `Authorization resource handler already registered: ${handler.resourceType}`,
      );
    }
    this.registered.set(handler.resourceType, {
      resourceType: handler.resourceType,
      groups: new ResourceGroups(),
      items: handler.items ?? new ResourceItems(),
    });
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
