import type { AuthorizationPlugin } from '../../core/plugin.js';
import { RuleService, type RuleApi } from '../internal/rules.js';
import { requireStore } from '../internal/store.js';
import type { DefaultAccessRule } from './model.js';
import type { DefaultAccessStore } from './store.js';

export interface DefaultAccessApi<TTransaction = unknown> extends RuleApi<
  DefaultAccessRule,
  TTransaction
> {
  /** An API bound to the caller's transaction, which the caller commits. */
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

export function defaultAccessPlugin<TTransaction = unknown>(
  options: DefaultAccessOptions<TTransaction>,
): DefaultAccessPlugin<TTransaction> {
  const service = new RuleService(
    {
      id: 'default-access',
      effect: 'expand',
      bySubject: false,
      allowAll: true,
    },
    requireStore(options.store, 'Default Access'),
  );
  return {
    id: 'default-access',
    authorizationApi: {
      defaultAccess: service,
    },
    setup(authz): void {
      authz.constraints.add(service);
    },
  };
}
