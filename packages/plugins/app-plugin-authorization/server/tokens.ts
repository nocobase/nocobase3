import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { AppAuthorization } from './authorization.js';
import type { ProtectedPermissionSetRegistry } from './protected-permission-sets.js';

export const authorizationToken: ServiceToken<AppAuthorization> =
  createServiceToken<AppAuthorization>('@nocobase/app/authorization');

export const protectedPermissionSetRegistryToken: ServiceToken<ProtectedPermissionSetRegistry> =
  createServiceToken<ProtectedPermissionSetRegistry>(
    '@nocobase/app/authorization/protected-permission-sets',
  );
