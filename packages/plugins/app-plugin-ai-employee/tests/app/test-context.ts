import { fileStorageFactoryToken } from '@nocobase/ai-employee';
import { cachingToken } from '@nocobase/app-server/caching';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';

import {
  createAgentContext,
  type AppAgentContext,
} from '../../server/agent/context.js';
import type { ConversationExecution } from '../../server/agent/contracts.js';
import type { Actor } from '../../server/domain/contracts.js';
import {
  ManagerFactory,
  managerFactoryToken,
} from '../../server/factory/manager-factory.js';
import {
  RepositoryFactory,
  repositoryFactoryToken,
} from '../../server/factory/repository-factory.js';
import {
  ServiceFactory,
  serviceFactoryToken,
} from '../../server/factory/service-factory.js';
import { aiManagerToken } from '../../server/provider/ai-employee.js';
import { createTestAppDeps } from './test-app-deps.js';

export function createTestActor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: 'fixture-user',
    roles: ['member'],
    isRoot: false,
    ...overrides,
  };
}

export function createTestConversationExecution(
  overrides: ConversationExecution = {},
): ConversationExecution {
  return { ...overrides };
}

export function createTestAIEmployeeFixture() {
  const deps = createTestAppDeps();
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, deps.database);
  container.instance(cachingToken, deps.caching);
  container.instance(fileStorageFactoryToken, deps.fileStorageFactory);
  container.instance(idGeneratorToken, deps.idGenerator);
  container.instance(loggingToken, deps.logging);
  container.instance(aiManagerToken, deps.ai);
  container.singleton(
    repositoryFactoryToken,
    (resolver) => new RepositoryFactory({ container: resolver }),
  );
  container.singleton(
    managerFactoryToken,
    (resolver) => new ManagerFactory({ container: resolver }),
  );
  container.singleton(
    serviceFactoryToken,
    () => new ServiceFactory({ container }),
  );
  const services = container.resolve(serviceFactoryToken);
  container.resolve(managerFactoryToken).configure({
    aiStorageDisk: deps.aiStorageDisk,
  });
  services.configure({
    paths: deps.paths,
    loadResources: false,
  });
  const managers = container.resolve(managerFactoryToken);
  const repositories = container.resolve(repositoryFactoryToken);
  return { container, deps, repositories, managers, services };
}

export function createTestAgentContext({
  actor = createTestActor(),
  execution = createTestConversationExecution(),
  state,
}: {
  actor?: Actor;
  execution?: ConversationExecution;
  state?: Parameters<typeof createAgentContext>[0]['state'];
} = {}): AppAgentContext {
  const fixture = createTestAIEmployeeFixture();
  return createAgentContext({
    actor,
    execution,
    state,
    ai: fixture.deps.ai,
    database: fixture.deps.database,
    logger: fixture.deps.logging.getLogger('ai-employee-test'),
    repositories: fixture.repositories,
    aiEmployeesManager: fixture.managers.aiEmployeesManager,
    aiConversationsManager: fixture.managers.aiConversationsManager,
    builtInManager: fixture.managers.builtInManager,
    knowledgeBaseManager: fixture.managers.knowledgeBaseManager,
    subAgentsDispatcher: fixture.managers.subAgentsDispatcher,
  });
}
