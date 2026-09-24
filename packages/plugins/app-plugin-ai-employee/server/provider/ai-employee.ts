import {
  createAIManager,
  DriveFileStorageFactory,
  fileStorageFactoryToken,
} from '@nocobase/ai-employee';
import {
  driveManagerToken,
  type AppDriveConfig,
} from '@nocobase/app-server/drive';
import { loggingToken } from '@nocobase/app-server/logging';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import path from 'node:path';

import type { AIApplicationConfig } from '../config.js';
import { resolveAIEmployeeStorageDisk } from '../config.js';
import {
  AIEmployeeResources,
  normalizeAISkillDirectories,
} from '../ai/index.js';
import { ManagerFactory } from '../factory/manager-factory.js';
import { RepositoryFactory } from '../factory/repository-factory.js';
import { AgentServiceFactory } from '../agent/service/agent-service-factory.js';
import { aiConversationsManagerToken } from '../manager/ai-conversations-manager.js';
import { databaseManagerToken } from '@nocobase/db';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  createDataServices,
  dataServicesFactoryToken,
} from '../service/data-services.js';
import { ServiceFactory } from '../factory/service-factory.js';
import {
  agentServiceFactoryToken,
  aiManagerToken,
  managerFactoryToken,
  repositoryFactoryToken,
  serviceFactoryToken,
} from '../tokens.js';

export { aiManagerToken };

export class AIEmployeeProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-ai-employee';
  private unsubscribeConfig: (() => void) | undefined;

  public override register(): void {
    this.app.container.singleton(
      fileStorageFactoryToken,
      (resolver) =>
        new DriveFileStorageFactory(resolver.resolve(driveManagerToken)),
    );
    this.app.container.singleton(aiManagerToken, (resolver) =>
      createAIManager(resolver.resolve(loggingToken).getLogger('ai-employee')),
    );
    this.app.container.singleton(
      repositoryFactoryToken,
      (resolver) => new RepositoryFactory({ container: resolver }),
    );
    this.app.container.singleton(
      managerFactoryToken,
      (resolver) => new ManagerFactory({ container: resolver }),
    );
    this.app.container.singleton(
      aiConversationsManagerToken,
      (resolver) =>
        resolver.resolve(managerFactoryToken).aiConversationsManager,
    );
    this.app.container.singleton(
      serviceFactoryToken,
      () => new ServiceFactory({ container: this.app.container }),
    );

    this.app.container.singleton(
      dataServicesFactoryToken,
      (resolver) => (scope) =>
        createDataServices({
          database: resolver.resolve(databaseManagerToken),
          authorization: resolver.has(authorizationToken)
            ? resolver.resolve(authorizationToken)
            : undefined,
          actor: scope.actor,
          timezone: scope.timezone,
        }),
    );

    this.app.container.singleton(
      agentServiceFactoryToken,
      (resolver) => new AgentServiceFactory({ container: resolver }),
    );
  }

  public override async boot(): Promise<void> {
    const services = this.app.container.resolve(serviceFactoryToken);
    const config = this.app.config.get<AIApplicationConfig>('ai')!;
    const aiStorageDisk = resolveAIEmployeeStorageDisk(
      config,
      this.app.config.get<AppDriveConfig>('drive')!.default,
    );
    this.app.container.resolve(managerFactoryToken).configure({
      aiStorageDisk,
    });
    const configuredSkillDirectories = normalizeAISkillDirectories(
      config.skills?.paths ?? [],
      this.app.paths.root(),
    );
    services.configure({
      llmServices: config.llmServices,
      mcpServers: config.mcpServers,
      resourceRegistrar: new AIEmployeeResources({
        logger: this.app.container
          .resolve(loggingToken)
          .getLogger('ai-employee'),
        skillsDirectories: [
          {
            directory: path.resolve(this.app.paths.root(), 'ai/skills'),
            source: 'application',
            optional: true,
          },
          ...configuredSkillDirectories,
        ],
      }),
    });
    await services.initialize();
    this.unsubscribeConfig = this.app.config.subscribe<AIApplicationConfig>(
      'ai',
      async ({ current }): Promise<void> => {
        await services.ready();
        await services.llmServiceConfigSynchronizer.enqueue(
          current.llmServices,
        );
        await services.mcpServerService.syncConfiguredMCPServers(
          current.mcpServers,
        );
      },
    );
  }

  public override shutdown(): Promise<void> {
    this.unsubscribeConfig?.();
    this.unsubscribeConfig = undefined;
    return Promise.resolve();
  }
}
