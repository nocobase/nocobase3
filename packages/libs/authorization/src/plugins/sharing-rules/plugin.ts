import type { AuthorizationPlugin } from '../../core/index.js';
import { SharingRuleService, type SharingRulesApi } from './service.js';
import type { SharingRuleStore } from './store.js';
import { requireStore } from '../internal/store.js';
import {
  createSharingRulesHandler,
  SHARING_RULES_ROUTE_PATH,
} from './routes.js';

export interface SharingRulesAuthorizationApi<TTransaction = unknown> {
  sharingRules: SharingRulesApi<TTransaction>;
}

export interface SharingRulesOptions<TTransaction = unknown> {
  store: SharingRuleStore<TTransaction>;
}

export type SharingRulesPlugin<TTransaction = unknown> = AuthorizationPlugin<
  SharingRulesAuthorizationApi<TTransaction>
>;

export function sharingRules<TTransaction = unknown>(
  options: SharingRulesOptions<TTransaction>,
): SharingRulesPlugin<TTransaction> {
  const service = new SharingRuleService(
    requireStore(options.store, 'Sharing Rules'),
  );
  return {
    id: 'sharing-rules',
    authorizationApi: { sharingRules: service },
    setup(authz): void {
      authz.constraints.add(service);
      authz.routes.add(
        SHARING_RULES_ROUTE_PATH,
        createSharingRulesHandler(service),
      );
    },
  };
}
