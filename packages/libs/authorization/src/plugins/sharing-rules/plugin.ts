import type { AuthorizationPlugin } from '../../core/index.js';
import type { DatabaseConnection } from '@nocobase/db';
import { DatabaseSharingRuleStore } from './database-store.js';
import { SharingRuleService, type SharingRulesApi } from './service.js';
import type { SharingRuleStore } from './store.js';
import {
  createSharingRulesHandler,
  SHARING_RULES_ROUTE_PATH,
} from './routes.js';

export interface SharingRulesAuthorizationApi<
  TTransaction = DatabaseConnection,
> {
  sharingRules: SharingRulesApi<TTransaction>;
}

export interface SharingRulesOptions<TTransaction = DatabaseConnection> {
  store?: SharingRuleStore<TTransaction>;
}

export type SharingRulesPlugin<TTransaction = DatabaseConnection> =
  AuthorizationPlugin<SharingRulesAuthorizationApi<TTransaction>>;

/**
 * The default store binds transactions to a DatabaseConnection, so the
 * transaction handle is a DatabaseConnection unless a custom store declares
 * another one.
 */
export function sharingRules(
  options?: SharingRulesOptions<DatabaseConnection>,
): SharingRulesPlugin<DatabaseConnection>;
export function sharingRules<TTransaction>(
  options: SharingRulesOptions<TTransaction>,
): SharingRulesPlugin<TTransaction>;
export function sharingRules(
  options: SharingRulesOptions<DatabaseConnection> = {},
): SharingRulesPlugin<DatabaseConnection> {
  const service = new SharingRuleService(options.store);
  return {
    id: 'sharing-rules',
    authorizationApi: { sharingRules: service },
    setup(authz): void {
      if (!options.store) {
        if (!authz.connection) {
          throw new Error(
            'Sharing Rules requires createAuthorization({ connection }) or an explicit store',
          );
        }
        service.initialize(new DatabaseSharingRuleStore(authz.connection));
      }
      authz.constraints.add(service);
      authz.routes.add(
        SHARING_RULES_ROUTE_PATH,
        createSharingRulesHandler(service),
      );
    },
  };
}
