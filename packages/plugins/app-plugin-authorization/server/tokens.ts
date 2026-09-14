import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { Authorization } from '@nocobase/authorization/core';
import type { PermissionSetsApi } from '@nocobase/authorization/permissions';

export const authorizationToken: ServiceToken<Authorization> =
  createServiceToken<Authorization>('@nocobase/app/authorization');

export const permissionSetsToken: ServiceToken<PermissionSetsApi> =
  createServiceToken<PermissionSetsApi>(
    '@nocobase/app/authorization/permission-sets',
  );
