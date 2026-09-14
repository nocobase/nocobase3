import type { AuthorizationPlugin } from '../../core/index.js';
import { RestrictionRuleService, type RestrictionRulesApi } from './service.js';
import type { RestrictionRuleStore } from './store.js';
import { requireStore } from '../internal/store.js';
import {
  createRestrictionRulesHandler,
  RESTRICTION_RULES_ROUTE_PATH,
} from './routes.js';

export interface RestrictionRulesAuthorizationApi<TTransaction = unknown> {
  restrictionRules: RestrictionRulesApi<TTransaction>;
}
export interface RestrictionRulesOptions<TTransaction = unknown> {
  store: RestrictionRuleStore<TTransaction>;
}
export type RestrictionRulesPlugin<TTransaction = unknown> =
  AuthorizationPlugin<RestrictionRulesAuthorizationApi<TTransaction>>;

export function restrictionRules<TTransaction = unknown>(
  options: RestrictionRulesOptions<TTransaction>,
): RestrictionRulesPlugin<TTransaction> {
  const service = new RestrictionRuleService(
    requireStore(options.store, 'Restriction Rules'),
  );
  return {
    id: 'restriction-rules',
    authorizationApi: { restrictionRules: service },
    setup(authz): void {
      authz.constraints.add(service);
      authz.routes.add(
        RESTRICTION_RULES_ROUTE_PATH,
        createRestrictionRulesHandler(service),
      );
    },
  };
}
