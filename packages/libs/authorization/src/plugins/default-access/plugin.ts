import type {
  AccessConstraint,
  AccessConstraintResolver,
  AuthorizationPlugin,
  ResolveAccessConstraintsInput,
} from '../../core/index.js';
import type { DatabaseConnection } from '@nocobase/db';
import { DatabaseDefaultAccessStore } from './database-store.js';
import type { DefaultAccessRule } from './model.js';
import type { DefaultAccessStore } from './store.js';
import {
  createDefaultAccessHandler,
  DEFAULT_ACCESS_ROUTE_PATH,
} from './routes.js';

export interface DefaultAccessApi<TTransaction = DatabaseConnection> {
  set(rule: DefaultAccessRule): Promise<DefaultAccessRule>;
  get(
    resourceType: string,
    resourceId: string,
  ): Promise<DefaultAccessRule | undefined>;
  list(): Promise<readonly DefaultAccessRule[]>;
  delete(resourceType: string, resourceId: string): Promise<void>;
  /**
   * Returns an API bound to the caller's transaction. The caller opens and
   * commits the transaction.
   */
  withTransaction(transaction: TTransaction): DefaultAccessApi<TTransaction>;
}

export interface DefaultAccessAuthorizationApi<
  TTransaction = DatabaseConnection,
> {
  defaultAccess: DefaultAccessApi<TTransaction>;
}

export interface DefaultAccessOptions<TTransaction = DatabaseConnection> {
  store?: DefaultAccessStore<TTransaction>;
}

export type DefaultAccessPlugin<TTransaction = DatabaseConnection> =
  AuthorizationPlugin<DefaultAccessAuthorizationApi<TTransaction>>;

/**
 * The default store binds transactions to a DatabaseConnection, so the
 * transaction handle is a DatabaseConnection unless a custom store declares
 * another one.
 */
export function defaultAccess(
  options?: DefaultAccessOptions<DatabaseConnection>,
): DefaultAccessPlugin<DatabaseConnection>;
export function defaultAccess<TTransaction>(
  options: DefaultAccessOptions<TTransaction>,
): DefaultAccessPlugin<TTransaction>;
export function defaultAccess(
  options: DefaultAccessOptions<DatabaseConnection> = {},
): DefaultAccessPlugin<DatabaseConnection> {
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
      authz.routes.add(
        DEFAULT_ACCESS_ROUTE_PATH,
        createDefaultAccessHandler(service),
      );
    },
  };
}

class DefaultAccessService<TTransaction = DatabaseConnection>
  implements DefaultAccessApi<TTransaction>, AccessConstraintResolver
{
  readonly id = 'default-access';
  private store?: DefaultAccessStore<TTransaction>;

  constructor(store?: DefaultAccessStore<TTransaction>) {
    this.store = store;
  }

  initialize(store: DefaultAccessStore<TTransaction>): void {
    this.store = store;
  }

  withTransaction(transaction: TTransaction): DefaultAccessApi<TTransaction> {
    return new DefaultAccessService<TTransaction>(
      this.getStore().withTransaction(transaction),
    );
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
      .flatMap((rule) => {
        const configured = rule.actions.find(
          (action) => action.action === input.action,
        );
        return rule.resource.type === input.resource.type &&
          (rule.resource.id === '*' ||
            rule.resource.id === input.resource.id) &&
          configured
          ? [{ rule, configured }]
          : [];
      })
      .map(({ rule, configured }) => ({
        source: {
          plugin: this.id,
          id: `${rule.resource.type}:${rule.resource.id}`,
        },
        effect: 'expand' as const,
        value: configured.scope,
      }));
  }

  private getStore(): DefaultAccessStore<TTransaction> {
    if (!this.store) throw new Error('Default Access has not been initialized');
    return this.store;
  }
}
