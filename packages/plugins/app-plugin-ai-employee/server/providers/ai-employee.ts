import {
  createAIManager,
  DriveFileStorageFactory,
  fileStorageFactoryToken,
} from '@nocobase/ai-employee';
import { driveConfig, driveManagerToken } from '@nocobase/app-server/drive';
import { loggingToken } from '@nocobase/app-server/logging';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { aiConfig, resolveAIEmployeeStorageDisk } from '../config.js';
import {
  repositoryFactoryToken,
  serviceFactoryToken,
} from '../internal/tokens.js';
import { RepositoryFactory } from '../repository/database/factory.js';
import { ServiceFactory } from '../service/factory.js';
import { aiManagerToken } from '../tokens.js';

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
      serviceFactoryToken,
      () => new ServiceFactory({ container: this.app.container }),
    );
  }

  public override async boot(): Promise<void> {
    const services = this.app.container.resolve(serviceFactoryToken);
    const config = this.app.config.get(aiConfig);
    services.configure({
      paths: this.app.paths,
      aiStorageDisk: resolveAIEmployeeStorageDisk(
        config,
        this.app.config.get(driveConfig).default,
      ),
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
