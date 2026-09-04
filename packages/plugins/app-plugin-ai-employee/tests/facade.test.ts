import { fileStorageFactoryToken } from '@nocobase/ai-employee';
import { cachingToken } from '@nocobase/app-server/caching';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import {
  repositoryFactoryToken,
  serviceFactoryToken,
} from '../server/internal/tokens.js';
import { RepositoryFactory } from '../server/repository/database/factory.js';
import { ServiceFactory } from '../server/service/factory.js';
import { aiManagerToken } from '../server/tokens.js';
import { createTestAppDeps } from './app/test-app-deps.js';

function createContainer(): ServiceContainer {
  const deps = createTestAppDeps();
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, deps.database);
  container.instance(idGeneratorToken, deps.idGenerator);
  container.instance(loggingToken, deps.logging);
  container.instance(cachingToken, deps.caching);
  container.instance(fileStorageFactoryToken, deps.fileStorageFactory);
  container.instance(aiManagerToken, deps.ai);
  container.singleton(
    repositoryFactoryToken,
    (resolver) => new RepositoryFactory({ container: resolver }),
  );
  container.singleton(
    serviceFactoryToken,
    () => new ServiceFactory({ container }),
  );
  return container;
}

describe('AI employee container-scoped factories', () => {
  it('keeps lazy singleton bindings and getter instances inside one container', () => {
    const container = createContainer();

    expect(container.resolveIfCreated(repositoryFactoryToken)).toBeUndefined();
    expect(container.resolveIfCreated(serviceFactoryToken)).toBeUndefined();

    const repositories = container.resolve(repositoryFactoryToken);
    const services = container.resolve(serviceFactoryToken);
    services.configure({
      paths: createTestAppDeps().paths,
      aiStorageDisk: 'local',
      loadResources: false,
    });

    expect(container.resolve(repositoryFactoryToken)).toBe(repositories);
    expect(container.resolve(serviceFactoryToken)).toBe(services);
    expect(repositories.aiEmployees).toBe(repositories.aiEmployees);
    expect(services.modelService).toBe(services.modelService);
    expect(services.toolService).toBe(services.toolService);
  });

  it('isolates repositories, services, readiness and mutable managers by container', async () => {
    const firstContainer = createContainer();
    const secondContainer = createContainer();
    const first = firstContainer.resolve(serviceFactoryToken);
    const second = secondContainer.resolve(serviceFactoryToken);
    first.configure({
      paths: createTestAppDeps().paths,
      aiStorageDisk: 'local',
      loadResources: false,
    });
    second.configure({
      paths: createTestAppDeps().paths,
      aiStorageDisk: 'local',
      loadResources: false,
    });

    expect(first).not.toBe(second);
    expect(firstContainer.resolve(repositoryFactoryToken)).not.toBe(
      secondContainer.resolve(repositoryFactoryToken),
    );
    expect(first.conversationService).not.toBe(second.conversationService);
    await expect(first.ready()).rejects.toThrow('has not been initialized');
    await expect(second.ready()).rejects.toThrow('has not been initialized');

    const firstRuntime = first.createRequestRuntime({
      id: 'first',
      roles: ['member'],
      isRoot: false,
    });
    expect(firstRuntime).not.toHaveProperty('repositories');
    expect(firstRuntime).not.toHaveProperty('employeeService');
    expect(firstRuntime).not.toHaveProperty('conversationService');
    expect(firstRuntime).not.toHaveProperty('aiConversationService');
    const secondRuntime = second.createRequestRuntime({
      id: 'second',
      roles: ['member'],
      isRoot: false,
    });
    expect(first.runtimeServices.aiEmployeesManager).not.toBe(
      second.runtimeServices.aiEmployeesManager,
    );
    expect(firstRuntime).not.toHaveProperty('aiEmployeesManager');
    expect(firstRuntime).not.toHaveProperty('aiConversationsManager');
    expect(firstRuntime).not.toHaveProperty('knowledgeBaseManager');
    expect(firstRuntime.currentUser.id).toBe('first');
    expect(secondRuntime.currentUser.id).toBe('second');
  });
});
