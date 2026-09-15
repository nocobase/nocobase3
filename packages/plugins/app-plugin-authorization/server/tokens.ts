import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { PermissionSetsApi } from '@nocobase/authorization/permissions';

import type { createAppAuthorization } from './authorization.js';

/** What the application registers: the Authorization with its built-in apis. */
export type AppAuthorizationService = ReturnType<typeof createAppAuthorization>;

export const authorizationToken: ServiceToken<AppAuthorizationService> =
  createServiceToken<AppAuthorizationService>('@nocobase/app/authorization');

export const permissionSetsToken: ServiceToken<PermissionSetsApi> =
  createServiceToken<PermissionSetsApi>(
    '@nocobase/app/authorization/permission-sets',
  );
