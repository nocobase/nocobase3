import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { DatabaseManager } from './manager.js';

/** The application database manager registered in a service container. */
export const databaseManagerToken: ServiceToken<DatabaseManager> =
  createServiceToken<DatabaseManager>('@nocobase/db/manager');
