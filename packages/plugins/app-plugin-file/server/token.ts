import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { ServerFileRepositoryManager } from './repository.js';
export const serverFileRepositoryManagerToken: ServiceToken<ServerFileRepositoryManager> =
  createServiceToken('serverFileRepositoryManager');
