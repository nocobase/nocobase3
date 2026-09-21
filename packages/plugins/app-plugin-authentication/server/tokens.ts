import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { Auth } from './auth.js';
import type { UserAuthenticationService } from './user-authentication.js';
import type { UserStoreFactory } from './user-store.js';

export const authenticationToken: ServiceToken<Auth> = createServiceToken<Auth>(
  '@nocobase/app/authentication',
);

/** Passwords, credential accounts and sessions of a user; the user record itself is the users plugin's. */
export const userAuthenticationServiceToken: ServiceToken<UserAuthenticationService> =
  createServiceToken<UserAuthenticationService>(
    '@nocobase/app/authentication/user-authentication',
  );

/** Registered by the users plugin so Better Auth reads and writes users through it. */
export const userStoreToken: ServiceToken<UserStoreFactory> =
  createServiceToken<UserStoreFactory>(
    '@nocobase/app/authentication/user-store',
  );
