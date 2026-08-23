import type {
  AccessConstraint,
  AccessConstraintResolver,
  AuthorizationPlugin,
  ResolveAccessConstraintsInput,
} from '../../core/index.js';
import { DatabaseDefaultAccessStore } from './database-store.js';
import type { DefaultAccessRule } from './model.js';
import type { DefaultAccessStore } from './store.js';

export interface DefaultAccessApi {
  set(rule: DefaultAccessRule): Promise<DefaultAccessRule>;
  get(
    resourceType: string,
    resourceId: string,
  ): Promise<DefaultAccessRule | undefined>;
  list(): Promise<readonly DefaultAccessRule[]>;
  delete(resourceType: string, resourceId: string): Promise<void>;
}

export interface DefaultAccessAuthorizationApi {
  defaultAccess: DefaultAccessApi;
}

export interface DefaultAccessOptions {
  store?: DefaultAccessStore;
}

export type DefaultAccessPlugin =
  AuthorizationPlugin<DefaultAccessAuthorizationApi>;

export function defaultAccess(
  options: DefaultAccessOptions = {},
): DefaultAccessPlugin {
  const service = new DefaultAccessService(options.store);
  return {
    id: 'default-access',
    authorizationApi: { defaultAccess: service },
    setup(authz): void {
      if (!options.store) {
        if (!authz.connection) {
          throw new Error(
            'Default Access requires createAuthorization({ connection }) or an explicit store',
          );
        }
        service.initialize(new DatabaseDefaultAccessStore(authz.connection));
      }
      authz.constraints.add(service);
    },
  };
}

class DefaultAccessService
  implements DefaultAccessApi, AccessConstraintResolver
{
  readonly id = 'default-access';
  private store?: DefaultAccessStore;

  constructor(store?: DefaultAccessStore) {
    this.store = store;
  }

  initialize(store: DefaultAccessStore): void {
    this.store = store;
  }

  set(rule: DefaultAccessRule): Promise<DefaultAccessRule> {
    return this.getStore().set(rule);
  }

  get(
    resourceType: string,
    resourceId: string,
  ): Promise<DefaultAccessRule | undefined> {
    return this.getStore().get(resourceType, resourceId);
  }

  list(): Promise<readonly DefaultAccessRule[]> {
    return this.getStore().list();
  }

  delete(resourceType: string, resourceId: string): Promise<void> {
    return this.getStore().delete(resourceType, resourceId);
  }

  async resolve(
    input: ResolveAccessConstraintsInput,
  ): Promise<readonly AccessConstraint[]> {
    const rules = await this.getStore().list();
    return rules
      .filter(
        (rule) =>
          rule.resource.type === input.resource.type &&
          (rule.resource.id === '*' ||
            rule.resource.id === input.resource.id) &&
          rule.actions.includes(input.action),
      )
      .map((rule) => ({
        source: {
          plugin: this.id,
          id: `${rule.resource.type}:${rule.resource.id}`,
        },
        effect: 'expand' as const,
        value: rule.scope,
      }));
  }

  private getStore(): DefaultAccessStore {
    if (!this.store) throw new Error('Default Access has not been initialized');
    return this.store;
  }
}
