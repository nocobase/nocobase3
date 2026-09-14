import type { AuthorizationPlugin } from '../../core/index.js';
import type { DatabaseConnection } from '@nocobase/db';
import { DatabaseRestrictionRuleStore } from './database-store.js';
import { RestrictionRuleService, type RestrictionRulesApi } from './service.js';
import type { RestrictionRuleStore } from './store.js';

export interface RestrictionRulesAuthorizationApi<
  TTransaction = DatabaseConnection,
> {
  restrictionRules: RestrictionRulesApi<TTransaction>;
}
export interface RestrictionRulesOptions<TTransaction = DatabaseConnection> {
  store?: RestrictionRuleStore<TTransaction>;
}
export type RestrictionRulesPlugin<TTransaction = DatabaseConnection> =
  AuthorizationPlugin<RestrictionRulesAuthorizationApi<TTransaction>>;

/**
 * The default store binds transactions to a DatabaseConnection, so the
 * transaction handle is a DatabaseConnection unless a custom store declares
 * another one.
 */
export function restrictionRules(
  options?: RestrictionRulesOptions<DatabaseConnection>,
): RestrictionRulesPlugin<DatabaseConnection>;
export function restrictionRules<TTransaction>(
  options: RestrictionRulesOptions<TTransaction>,
): RestrictionRulesPlugin<TTransaction>;
export function restrictionRules(
  options: RestrictionRulesOptions<DatabaseConnection> = {},
): RestrictionRulesPlugin<DatabaseConnection> {
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
