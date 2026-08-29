import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { __NOCOBASE_SYMBOL_NAME__Service } from './service.js';

export type { __NOCOBASE_SYMBOL_NAME__Service } from './service.js';

export const __NOCOBASE_MODULE_NAME__ServiceToken: ServiceToken<__NOCOBASE_SYMBOL_NAME__Service> =
  createServiceToken<__NOCOBASE_SYMBOL_NAME__Service>(
    __NOCOBASE_SERVICE_TOKEN_NAME_LITERAL__,
  );
