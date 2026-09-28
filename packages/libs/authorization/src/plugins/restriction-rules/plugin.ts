import type { AuthorizationPlugin } from '../../core/plugin.js';
import { RuleService, type RuleApi } from '../internal/rules.js';
import { requireStore } from '../internal/store.js';
import type { RestrictionRule } from './model.js';
import type { RestrictionRuleStore } from './store.js';

export interface RestrictionRulesApi<TTransaction = unknown> extends RuleApi<
  RestrictionRule,
  TTransaction
> {
  /** An API bound to the caller's transaction, which the caller commits. */
  withTransaction(transaction: TTransaction): RestrictionRulesApi<TTransaction>;
}

export interface RestrictionRulesAuthorizationApi<TTransaction = unknown> {
  restrictionRules: RestrictionRulesApi<TTransaction>;
}

export interface RestrictionRulesOptions<TTransaction = unknown> {
  store: RestrictionRuleStore<TTransaction>;
}

export type RestrictionRulesPlugin<TTransaction = unknown> =
  AuthorizationPlugin<RestrictionRulesAuthorizationApi<TTransaction>>;

export function restrictionRulesPlugin<TTransaction = unknown>(
  options: RestrictionRulesOptions<TTransaction>,
): RestrictionRulesPlugin<TTransaction> {
  const service = new RuleService(
    {
      id: 'restriction-rules',
      effect: 'restrict',
      bySubject: true,
      allowAll: true,
    },
    requireStore(options.store, 'Restriction Rules'),
  );
  return {
    id: 'restriction-rules',
    authorizationApi: {
      restrictionRules: service,
    },
    setup(authz): void {
      authz.constraints.add(service);
    },
  };
}
