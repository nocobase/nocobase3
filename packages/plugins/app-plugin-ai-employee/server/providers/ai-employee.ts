import {
  createAIManager,
  DriveFileStorageFactory,
  fileStorageFactoryToken,
} from '@nocobase/ai-employee';
import { cachingToken } from '@nocobase/app-server/caching';
import { driveConfig, driveManagerToken } from '@nocobase/app-server/drive';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { loggingToken } from '@nocobase/app-server/logging';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  type ServiceResolver,
} from '@nocobase/service-provider';

import { aiConfig, resolveAIEmployeeStorageDisk } from '../config.js';
import { LLMServiceConfigSynchronizer } from '../llm-service-config.js';
import {
  createPluginRuntime,
  initializePluginRuntimeResources,
  waitForPluginReady,
  type AppDeps,
} from '../runtime.js';
import { aiEmployeeRuntimeToken, aiManagerToken } from '../tokens.js';

export class AIEmployeeProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-ai-employee';
  private unsubscribeConfig: (() => void) | undefined;

  public override register(): void {
    this.app.container.singleton(
      fileStorageFactoryToken,
      (container) =>
        new DriveFileStorageFactory(container.resolve(driveManagerToken)),
    );
    this.app.container.singleton(aiManagerToken, (container) =>
      createAIManager(container.resolve(loggingToken).getLogger('ai-employee')),
    );
    this.app.container.singleton(aiEmployeeRuntimeToken, (container) =>
      createPluginRuntime({ deps: this.resolveDeps(container) }),
    );
  }

  public override async boot(): Promise<void> {
    const deps = this.resolveDeps(this.app.container);
    const logger = deps.logging.getLogger('ai-employee');
    const synchronizer = new LLMServiceConfigSynchronizer(
      deps.ai.llmServiceManager,
      logger,
    );
    this.unsubscribeConfig = this.app.config.subscribe(
      aiConfig,
      async ({ current }): Promise<void> => {
        await waitForPluginReady();
        await synchronizer.enqueue(current.llmServices);
      },
    );
    const config = this.app.config.get(aiConfig);
    initializePluginRuntimeResources(deps, {
      llmServices: config.llmServices,
      llmServiceSynchronizer: synchronizer,
    });
    await waitForPluginReady();
  }

  public override shutdown(): Promise<void> {
    this.unsubscribeConfig?.();
    this.unsubscribeConfig = undefined;
    return Promise.resolve();
  }

  private resolveDeps(container: ServiceResolver): AppDeps {
    return {
      ai: container.resolve(aiManagerToken),
      paths: this.app.paths,
      database: container.resolve(databaseManagerToken),
      auth: container.resolve(authenticationToken),
      caching: container.resolve(cachingToken),
      fileStorageFactory: container.resolve(fileStorageFactoryToken),
      aiStorageDisk: resolveAIEmployeeStorageDisk(
        this.app.config.get(aiConfig),
        this.app.config.get(driveConfig).default,
      ),
      idGenerator: container.resolve(idGeneratorToken),
      logging: container.resolve(loggingToken),
    };
  }
}
