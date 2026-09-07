import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import {
  AuditAuthorization,
  registerAuditPermissions,
  type AuditAuthorizationOptions,
} from '../authorization.js';
import { ScopedAuditQueryService } from '../query-service.js';
import type { PortableAuditStore } from '../store.js';
import type { PersistentAuditSettingsService } from '../settings-service.js';
import { AuditError } from '../errors.js';

export interface AuditQueryResourcesOptions extends AuditAuthorizationOptions {
  readonly appAuthorization: AppAuthorization;
  readonly eventStores: readonly PortableAuditStore[];
  readonly configurationStore: PortableAuditStore;
  readonly settings: PersistentAuditSettingsService;
}
export interface AuditQueryResources {
  readonly authorization: AuditAuthorization;
  readonly query: ScopedAuditQueryService;
}
/** Build scoped query services for the application's audit routes. */
export function createAuditQueryResources(
  options: AuditQueryResourcesOptions,
): AuditQueryResources {
  options.settings.assertConfigurationStore(options.configurationStore);
  options.configurationStore.assertScope(options.boundary);
  if (
    new Set(options.stores).size !== options.stores.length ||
    options.stores.length !== options.eventStores.length ||
    options.eventStores.some(
      (store) => !options.stores.includes(store.binding.store),
    )
  )
    throw new AuditError('AUDIT_TARGET_UNSUPPORTED');
  for (const store of options.eventStores) store.assertScope(options.boundary);
  registerAuditPermissions(options.appAuthorization);
  const authorization = new AuditAuthorization(options);
  return {
    authorization,
    query: new ScopedAuditQueryService(authorization, options.eventStores),
  };
}
