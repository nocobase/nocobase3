import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { ClientFileRepositoryManager } from './manager.js';
export const clientFileRepositoryManagerToken: ServiceToken<ClientFileRepositoryManager> =
  createServiceToken('clientFileRepositoryManager');
