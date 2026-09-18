import {
  ResourceActionRegistry,
  type ResourceAction,
  type ResourceActionDeclaration,
} from './resource-actions.js';
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

export interface ResourceActionScopes {
  readonly policyType: string;
  readonly fields: readonly {
    readonly key: string;
    readonly title: ResourceTitle;
    readonly defaultValue: string;
    readonly options: readonly {
      readonly value: string;
      readonly title: ResourceTitle;
    }[];
  }[];
}

export interface ResourceItem {
  readonly id: string;
  readonly title?: ResourceTitle;
  readonly description?: ResourceTitle;
  readonly group?: string;
  readonly actions: readonly string[];
  readonly actionTitles?: Readonly<Record<string, ResourceTitle>>;
  readonly actionScopes?: Readonly<Record<string, ResourceActionScopes>>;
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

export interface ResourceItemDefinition extends Omit<ResourceItem, 'actions'> {
  readonly actions: readonly ResourceActionDeclaration[];
}

export class ResourceItems {
  readonly actionRegistry: ResourceActionRegistry =
    new ResourceActionRegistry();
  private readonly entries = new Map<string, ResourceItem>();

  add(definition: ResourceItemDefinition): void {
    const item: ResourceItem = {
      ...definition,
      actions: definition.actions.map((action) =>
        typeof action === 'string' ? action : action.name,
      ),
      actionTitles: {
        ...definition.actionTitles,
        ...Object.fromEntries(
          definition.actions.flatMap((action) =>
            typeof action !== 'string' && action.title
              ? [[action.name, action.title]]
              : [],
          ),
        ),
      },
      actionScopes: {
        ...definition.actionScopes,
        ...Object.fromEntries(
          definition.actions.flatMap((action) =>
            typeof action !== 'string' && action.scope
              ? [[action.name, action.scope]]
              : [],
          ),
        ),
      },
    };
    if (!item.id || item.actions.length === 0)
      throw new Error('Resource items require an id and actions');
    if (this.entries.has(item.id))
      throw new Error(`Resource item already registered: ${item.id}`);
    for (const [action, config] of Object.entries(item.actionScopes ?? {})) {
      if (
        !item.actions.includes(action) ||
        !config.policyType ||
        !config.fields.length
      ) {
        throw new Error(`Invalid scope configuration: ${item.id}.${action}`);
      }
      const keys = new Set<string>();
      for (const field of config.fields) {
        const values = field.options.map((option) => option.value);
        if (
          !field.key ||
          field.key === 'type' ||
          keys.has(field.key) ||
          new Set(values).size !== values.length ||
          !values.includes(field.defaultValue)
        ) {
          throw new Error(
            `Invalid scope field: ${item.id}.${action}.${field.key}`,
          );
        }
        keys.add(field.key);
      }
    }
    this.actionRegistry.add(item.id, definition.actions);
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
  readonly title?: ResourceTitle;
  readonly actionTitles?: Readonly<Record<string, ResourceTitle>>;
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
  title?: ResourceTitle;
  actionTitles?: Readonly<Record<string, ResourceTitle>>;
  actions?: readonly ResourceAction[];
  authorize?(
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
    const items = handler.items ?? new ResourceItems();
    const itemActions =
      typeof items === 'object' &&
      items !== null &&
      'actionRegistry' in items &&
      items.actionRegistry instanceof ResourceActionRegistry
        ? items.actionRegistry
        : undefined;
    if (handler.actions) {
      if (!itemActions)
        throw new TypeError(
          'Action-based resources require an action-aware item registry',
        );
      itemActions.configure(handler.actions);
    }
    if (!handler.authorize && !handler.actions?.length)
      throw new TypeError('Resources require action definitions or authorize');
    const denied = (): AuthorizationDecision => ({
      effect: 'deny',
      reasons: [
        {
          code:
            handler.resourceType === 'database.collection'
              ? 'UNKNOWN_DATABASE_RESOURCE_OR_ACTION'
              : 'RESOURCE_ACTION_NOT_SUPPORTED',
          message: 'This item does not expose the requested action',
        },
      ],
    });
    const selectedAction = (
      request: StoredResourceAuthorizationRequest,
    ): ResourceAction | undefined =>
      itemActions?.resolve(request.resource.id, request.action);
    this.registered.set(handler.resourceType, {
      resourceType: handler.resourceType,
      title: handler.title,
      actionTitles: {
        ...handler.actionTitles,
        ...Object.fromEntries(
          (handler.actions ?? []).flatMap((action) =>
            action.title ? [[action.name, action.title]] : [],
          ),
        ),
      },
      groups: new ResourceGroups(),
      items,
    });
    const authorizeUnrestricted = handler.authorizeUnrestricted?.bind(handler);
    this.handlers.set(handler.resourceType, {
      resourceType: handler.resourceType,
      authorize(request, context): Promise<AuthorizationDecision> {
        const action = selectedAction(request);
        if (action)
          return action.authorize(
            { ...request, params: request.params },
            context,
          );
        if (
          handler.actions ||
          (itemActions?.declares(request.resource.id) &&
            !itemActions.resolve(request.resource.id, request.action) &&
            !handler.authorize)
        )
          return Promise.resolve(denied());
        if (!handler.authorize) return Promise.resolve(denied());
        return handler.authorize(
          {
            ...request,
            params: request.params as TParams,
          } as AuthorizationRequest<TParams>,
          context,
        );
      },
      authorizeUnrestricted(request): Promise<AuthorizationDecision> {
        const action = selectedAction(request);
        if (action)
          return action.authorizeUnrestricted
            ? action.authorizeUnrestricted({
                ...request,
                params: request.params,
              })
            : Promise.resolve({
                effect: 'permit',
                reasons: [
                  {
                    code: 'UNRESTRICTED_ACCESS',
                    message: 'Unrestricted access',
                  },
                ],
              });
        if (handler.actions) return Promise.resolve(denied());
        return authorizeUnrestricted
          ? authorizeUnrestricted({
              ...request,
              params: request.params as TParams,
            } as AuthorizationRequest<TParams>)
          : Promise.resolve({
              effect: 'permit',
              reasons: [
                { code: 'UNRESTRICTED_ACCESS', message: 'Unrestricted access' },
              ],
            });
      },
    });
  }

  getAction(
    type: string,
    id: string,
    action: string,
  ): ResourceAction | undefined {
    const items = this.registered.get(type)?.items;
    return items &&
      typeof items === 'object' &&
      'actionRegistry' in items &&
      items.actionRegistry instanceof ResourceActionRegistry
      ? items.actionRegistry.resolve(id, action)
      : undefined;
  }
  get(resourceType: string): StoredResourceAuthorizationHandler | undefined {
    return this.handlers.get(resourceType);
  }

  list(): string[] {
    return [...this.handlers.keys()].sort();
  }
}
