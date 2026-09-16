import type {
  AccessConstraint,
  AccessConstraintResolver,
  AuthorizationPlugin,
  ResolveAccessConstraintsInput,
} from '../../core/index.js';
import type { DefaultAccessRule } from './model.js';
import type { DefaultAccessStore } from './store.js';
import { requireStore } from '../internal/store.js';
import {
  createDefaultAccessHandler,
  DEFAULT_ACCESS_ROUTE_PATH,
} from './routes.js';

export interface DefaultAccessApi<TTransaction = unknown> {
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

export interface DefaultAccessAuthorizationApi<TTransaction = unknown> {
  defaultAccess: DefaultAccessApi<TTransaction>;
}

export interface DefaultAccessOptions<TTransaction = unknown> {
  store: DefaultAccessStore<TTransaction>;
}

export type DefaultAccessPlugin<TTransaction = unknown> = AuthorizationPlugin<
  DefaultAccessAuthorizationApi<TTransaction>
>;

export function defaultAccess<TTransaction = unknown>(
  options: DefaultAccessOptions<TTransaction>,
): DefaultAccessPlugin<TTransaction> {
  const service = new DefaultAccessService(
    requireStore(options.store, 'Default Access'),
  );
  return {
    id: 'default-access',
    authorizationApi: { defaultAccess: service },
    setup(authz): void {
      authz.constraints.add(service);
      authz.routes.add(
        DEFAULT_ACCESS_ROUTE_PATH,
        createDefaultAccessHandler(service),
      );
    },
  };
}

class DefaultAccessService<TTransaction = unknown>
  implements DefaultAccessApi<TTransaction>, AccessConstraintResolver
{
  readonly id = 'default-access';

  constructor(private readonly store: DefaultAccessStore<TTransaction>) {}

  withTransaction(transaction: TTransaction): DefaultAccessApi<TTransaction> {
    return new DefaultAccessService<TTransaction>(
      this.store.withTransaction(transaction),
    );
  }

  set(rule: DefaultAccessRule): Promise<DefaultAccessRule> {
    return this.store.set(rule);
  }

  get(
    resourceType: string,
    resourceId: string,
  ): Promise<DefaultAccessRule | undefined> {
    return this.store.get(resourceType, resourceId);
  }

  list(): Promise<readonly DefaultAccessRule[]> {
    return this.store.list();
  }

  delete(resourceType: string, resourceId: string): Promise<void> {
    return this.store.delete(resourceType, resourceId);
  }

  scope(): AccessConstraintResolver {
    let rules: Promise<readonly DefaultAccessRule[]> | undefined;
    return {
      id: this.id,
      resolve: async (input) =>
        this.resolveRules(input, await (rules ??= this.store.list())),
    };
  }

  async resolve(
    input: ResolveAccessConstraintsInput,
  ): Promise<readonly AccessConstraint[]> {
    return this.resolveRules(input, await this.store.list());
  }

  private resolveRules(
    input: ResolveAccessConstraintsInput,
    rules: readonly DefaultAccessRule[],
  ): readonly AccessConstraint[] {
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
}
