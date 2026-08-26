import type { AuthorizationPlugin } from '../../core/index.js';
import { DatabaseRestrictionRuleStore } from './database-store.js';
import { RestrictionRuleService, type RestrictionRulesApi } from './service.js';
import type { RestrictionRuleStore } from './store.js';

export interface RestrictionRulesAuthorizationApi {
  restrictionRules: RestrictionRulesApi;
}
export interface RestrictionRulesOptions {
  store?: RestrictionRuleStore;
}
export type RestrictionRulesPlugin =
  AuthorizationPlugin<RestrictionRulesAuthorizationApi>;

export function restrictionRules(
  options: RestrictionRulesOptions = {},
): RestrictionRulesPlugin {
  const service = new RestrictionRuleService(options.store);
  return {
    id: 'restriction-rules',
    authorizationApi: { restrictionRules: service },
    setup(authz): void {
      if (!options.store) {
        if (!authz.connection)
          throw new Error(
            'Restriction Rules requires createAuthorization({ connection }) or an explicit store',
          );
        service.initialize(new DatabaseRestrictionRuleStore(authz.connection));
      }
      authz.constraints.add(service);
    },
  };
}
