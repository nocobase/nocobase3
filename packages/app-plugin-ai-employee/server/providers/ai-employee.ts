import { createAIManager } from '@nocobase/ai-employee';
import { databaseManagerToken } from '@nocobase/app-database';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { cachingToken } from '@nocobase/caching';
import { driveManagerToken } from '@nocobase/drive';
import { idGeneratorToken } from '@nocobase/id-generator';
import { loggingToken } from '@nocobase/logging';
import {
  ServiceProvider,
  type ServiceResolver,
} from '@nocobase/service-provider';

import {
  createPluginRuntime,
  initializePluginRuntimeResources,
  waitForPluginReady,
  type AppDeps,
} from '../runtime.js';
import { aiEmployeeRuntimeToken, aiManagerToken } from '../tokens.js';

export class AIEmployeeProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-ai-employee';

  public override register(): void {
    this.app.container.singleton(aiManagerToken, (container) =>
      createAIManager(container.resolve(loggingToken).getLogger('ai-employee')),
    );
    this.app.container.singleton(aiEmployeeRuntimeToken, (container) =>
      createPluginRuntime({ deps: this.resolveDeps(container) }),
    );
  }

  public override async boot(): Promise<void> {
    initializePluginRuntimeResources(this.resolveDeps(this.app.container));
    await waitForPluginReady();
  }

  private resolveDeps(container: ServiceResolver): AppDeps {
    return {
      ai: container.resolve(aiManagerToken),
      paths: this.app.paths,
      database: container.resolve(databaseManagerToken),
      auth: container.resolve(authenticationToken),
      caching: container.resolve(cachingToken),
      driveManager: container.has(driveManagerToken)
        ? container.resolve(driveManagerToken)
        : undefined,
      idGenerator: container.resolve(idGeneratorToken),
      logging: container.resolve(loggingToken),
    };
  }
}
