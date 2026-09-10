import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { Auth } from './auth.js';
import type { UserAdministrationService } from './user-administration.js';

export const authenticationToken: ServiceToken<Auth> = createServiceToken<Auth>(
  '@nocobase/app/authentication',
);

export const userAdministrationServiceToken: ServiceToken<UserAdministrationService> =
  createServiceToken<UserAdministrationService>(
    '@nocobase/app/authentication/user-administration',
  );
