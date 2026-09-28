import type { AIManager } from '@nocobase/ai-employee';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { AgentServiceFactory } from './agent/service/agent-service-factory.js';
import type { ManagerFactory } from './factory/manager-factory.js';
import type { RepositoryFactory } from './factory/repository-factory.js';
import type { ServiceFactory } from './factory/service-factory.js';

// The container tokens the plugin's own modules resolve one another by. They
// live apart from the classes they name, and this module imports no value of
// its own, because a tool imports its dependency tokens while the module that
// registers that tool is still loading: a token declared beside its class is
// read before it exists whenever that class's module is the one loading.

/** Public cross-plugin AI manager capability. */
export const aiManagerToken: ServiceToken<AIManager> =
  createServiceToken<AIManager>('@nocobase/app-plugin-ai-employee/manager');

export const agentServiceFactoryToken: ServiceToken<AgentServiceFactory> =
  createServiceToken<AgentServiceFactory>(
    '@nocobase/app-plugin-ai-employee/agent-service-factory',
  );

export const managerFactoryToken: ServiceToken<ManagerFactory> =
  createServiceToken<ManagerFactory>(
    '@nocobase/app-plugin-ai-employee/internal/managers',
  );

export const repositoryFactoryToken: ServiceToken<RepositoryFactory> =
  createServiceToken<RepositoryFactory>(
    '@nocobase/app-plugin-ai-employee/internal/repositories',
  );

export const serviceFactoryToken: ServiceToken<ServiceFactory> =
  createServiceToken<ServiceFactory>(
    '@nocobase/app-plugin-ai-employee/internal/services',
  );
