import { createAIManager } from '@nocobase/ai-employee';
import { databaseManagerToken } from '@nocobase/app-database';
import {
  cachingToken,
  driveManagerToken,
  idGeneratorToken,
  loggingToken,
  type AppPluginApplication,
} from '@nocobase/app-server-kit';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
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
    const deps = this.resolveDeps(this.app.container);
    initializePluginRuntimeResources(deps);
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
