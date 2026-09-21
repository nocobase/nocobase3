import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { Auth } from './auth.js';
import type { AuthenticationCredentialService } from './credentials.js';

export const authenticationToken: ServiceToken<Auth> = createServiceToken<Auth>(
  '@nocobase/app/authentication',
);

export const authenticationCredentialServiceToken: ServiceToken<AuthenticationCredentialService> =
  createServiceToken<AuthenticationCredentialService>(
    '@nocobase/app/authentication/credentials',
  );
