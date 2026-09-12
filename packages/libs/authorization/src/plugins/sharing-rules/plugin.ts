import type { AuthorizationPlugin } from '../../core/index.js';
import { DatabaseSharingRuleStore } from './database-store.js';
import { SharingRuleService, type SharingRulesApi } from './service.js';
import type { SharingRuleStore } from './store.js';

export interface SharingRulesAuthorizationApi {
  sharingRules: SharingRulesApi;
}

export interface SharingRulesOptions {
  store?: SharingRuleStore;
}

export type SharingRulesPlugin =
  AuthorizationPlugin<SharingRulesAuthorizationApi>;

export function sharingRules(
  options: SharingRulesOptions = {},
): SharingRulesPlugin {
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
    },
  };
}
