import {
  createAIManager,
  DriveFileStorageFactory,
  fileStorageFactoryToken,
  type AIManager,
} from '@nocobase/ai-employee';
import { driveConfig, driveManagerToken } from '@nocobase/app-server/drive';
import { loggingToken } from '@nocobase/app-server/logging';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { aiConfig, resolveAIEmployeeStorageDisk } from '../config.js';
import {
  ManagerFactory,
  managerFactoryToken,
} from '../factory/manager-factory.js';
import {
  RepositoryFactory,
  repositoryFactoryToken,
} from '../factory/repository-factory.js';
import {
  AgentServiceFactory,
  agentServiceFactoryToken,
} from '../agent/service/agent-service-factory.js';
import { aiConversationsManagerToken } from '../manager/ai-conversations-manager.js';
import {
  ServiceFactory,
  serviceFactoryToken,
} from '../factory/service-factory.js';

/** Public cross-plugin AI manager capability. */
export const aiManagerToken: ServiceToken<AIManager> =
  createServiceToken<AIManager>('@nocobase/app-plugin-ai-employee/manager');

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
      agentServiceFactoryToken,
      (resolver) => new AgentServiceFactory({ container: resolver }),
    );
  }

  public override async boot(): Promise<void> {
    const services = this.app.container.resolve(serviceFactoryToken);
    const config = this.app.config.get(aiConfig);
    const aiStorageDisk = resolveAIEmployeeStorageDisk(
      config,
      this.app.config.get(driveConfig).default,
    );
    this.app.container.resolve(managerFactoryToken).configure({
      aiStorageDisk,
    });
    services.configure({
      paths: this.app.paths,
      llmServices: config.llmServices,
    });
    await services.initialize();
    this.unsubscribeConfig = this.app.config.subscribe(
      aiConfig,
      async ({ current }): Promise<void> => {
        await services.ready();
        await services.llmServiceConfigSynchronizer.enqueue(
          current.llmServices,
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
