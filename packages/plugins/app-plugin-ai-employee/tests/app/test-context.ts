import { fileStorageFactoryToken } from '@nocobase/ai-employee';
import { cachingToken } from '@nocobase/app-server/caching';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';

import {
  repositoryFactoryToken,
  serviceFactoryToken,
} from '../../server/internal/tokens.js';
import { RepositoryFactory } from '../../server/repository/database/factory.js';
import { ServiceFactory } from '../../server/service/factory.js';
import { aiManagerToken } from '../../server/tokens.js';
import { createTestAppDeps } from './test-app-deps.js';

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
    serviceFactoryToken,
    () => new ServiceFactory({ container }),
  );
  const services = container.resolve(serviceFactoryToken);
  services.configure({
    paths: deps.paths,
    aiStorageDisk: deps.aiStorageDisk,
    loadResources: false,
  });
  const repositories = container.resolve(repositoryFactoryToken);
  const context = services.createRequestRuntime({
    id: 'fixture-user',
    roles: ['member'],
    isRoot: false,
  });
  return { context, repositories, services };
}

export function createTestAIEmployeeRuntime() {
  return createTestAIEmployeeFixture().context;
}
