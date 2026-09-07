import type { AuthorizationScope } from '@nocobase/app-plugin-authorization';
import type { AuditSettings, AuditSettingsMetadata } from '../contracts.js';
import {
  AuditAccessDenied,
  type AuditAuthorization,
} from '../authorization.js';
import type { PersistentAuditSettingsService } from '../settings-service.js';

export async function mayAccessSettings(
  authorization: AuditAuthorization,
  authz: AuthorizationScope,
  store: string,
  action: 'read' | 'manage',
): Promise<boolean> {
  try {
    await authorization.require(authz, store, 'audit.settings', action);
    return true;
  } catch (error) {
    if (error instanceof AuditAccessDenied) return false;
    throw error;
  }
}

export async function settingsMetadata(
  authorization: AuditAuthorization,
  authz: AuthorizationScope,
  service: PersistentAuditSettingsService,
  settings: AuditSettings,
  configurationStore: string,
  candidates: readonly string[],
): Promise<AuditSettingsMetadata> {
  const stores: string[] = [];
  for (const store of new Set(candidates)) {
    if (await mayAccessSettings(authorization, authz, store, 'read'))
      stores.push(store);
  }
  const requirements = service.requirements;
  const selected = [
    settings.observationStore,
    ...settings.sources.database.map((entry) => entry.dataSource),
    ...requirements.requiredDataSources,
  ];
  const complete = selected.every((store) => stores.includes(store));
  let canManage =
    complete &&
    (await mayAccessSettings(
      authorization,
      authz,
      configurationStore,
      'manage',
    ));
  for (const store of selected) {
    if (canManage)
      canManage = await mayAccessSettings(
        authorization,
        authz,
        store,
        'manage',
      );
  }
  return {
    requirements: {
      ...requirements,
      requiredDataSources: requirements.requiredDataSources.filter((store) =>
        stores.includes(store),
      ),
    },
    stores,
    complete,
    canManage,
  };
}
