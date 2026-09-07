import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { ManagerFactory } from '../managers/factory.js';
import type { RepositoryFactory } from '../repository/database/factory.js';
import type { ServiceFactory } from '../service/factory.js';

export const repositoryFactoryToken: ServiceToken<RepositoryFactory> =
  createServiceToken<RepositoryFactory>(
    '@nocobase/app-plugin-ai-employee/internal/repositories',
  );

export const managerFactoryToken: ServiceToken<ManagerFactory> =
  createServiceToken<ManagerFactory>(
    '@nocobase/app-plugin-ai-employee/internal/managers',
  );

export const serviceFactoryToken: ServiceToken<ServiceFactory> =
  createServiceToken<ServiceFactory>(
    '@nocobase/app-plugin-ai-employee/internal/services',
  );
