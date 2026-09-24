import type { AuthorizationPlugin } from '../../core/plugin.js';
import { RuleService, type RuleApi } from '../internal/rules.js';
import { requireStore } from '../internal/store.js';
import type { SharingRule } from './model.js';
import type { SharingRuleStore } from './store.js';

export interface SharingRulesApi<TTransaction = unknown> extends RuleApi<
  SharingRule,
  TTransaction
> {
  /** An API bound to the caller's transaction, which the caller commits. */
  withTransaction(transaction: TTransaction): SharingRulesApi<TTransaction>;
}

export interface SharingRulesAuthorizationApi<TTransaction = unknown> {
  sharingRules: SharingRulesApi<TTransaction>;
}

export interface SharingRulesOptions<TTransaction = unknown> {
  store: SharingRuleStore<TTransaction>;
}

export type SharingRulesPlugin<TTransaction = unknown> = AuthorizationPlugin<
  SharingRulesAuthorizationApi<TTransaction>
>;

export function sharingRulesPlugin<TTransaction = unknown>(
  options: SharingRulesOptions<TTransaction>,
): SharingRulesPlugin<TTransaction> {
  const service = new RuleService(
    { id: 'sharing-rules', effect: 'expand', bySubject: true, allowAll: false },
    requireStore(options.store, 'Sharing Rules'),
  );
  return {
    id: 'sharing-rules',
    authorizationApi: {
      sharingRules: service,
    },
    setup(authz): void {
      authz.constraints.add(service);
    },
  };
}
