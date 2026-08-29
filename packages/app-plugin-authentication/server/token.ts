import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { Auth } from './auth.js';

export const authenticationToken: ServiceToken<Auth> = createServiceToken<Auth>(
  '@nocobase/app/authentication',
);
