import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import { createAppDatabaseManager } from './manager.js';
import { executeAppDatabasePlan } from './tasks.js';
import { planAppRuntimeDatabaseTasks } from './plan.js';
import { prepareAppDatabaseStorage } from './storage.js';
import type { AppConfigAccessor, AppPaths } from '../config/index.js';
import type {
  AppDatabaseConfig,
  AppDatabaseTaskContributions,
} from './types.js';

export interface DatabaseProviderApplication {
  readonly config: AppConfigAccessor;
  readonly container: ServiceContainer;
  readonly paths: AppPaths;
  readonly databaseTaskContributions: AppDatabaseTaskContributions;
}

export class DatabaseProvider extends ServiceProvider<DatabaseProviderApplication> {
  public readonly name: string = '@nocobase/app-server/database';

  public override register(): void {
    const config = this.getDatabaseConfig();
    if (config.default === 'none') {
      return;
    }

    this.app.container.singleton(databaseManagerToken, () => {
      const database = createAppDatabaseManager(config, this.app.paths);
      if (!database) {
        throw new Error('Database is not configured.');
      }

      return database;
    });
  }

  public override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(databaseManagerToken)) {
      return;
    }

    const config = this.getDatabaseConfig();
    const plan = planAppRuntimeDatabaseTasks(config, ['migrations', 'seeds'], {
      paths: this.app.paths,
      contributions: this.app.databaseTaskContributions,
      runtimeConfig: this.app.config,
      autoRun: true,
    });
    // All SQLite connections must be usable by runtime services even without automatic tasks.
    await prepareAppDatabaseStorage(
      config,
      this.app.paths,
      Object.keys(config.connections),
    );
    const database = container.resolve(databaseManagerToken);
    await executeAppDatabasePlan(database, config, plan, {
      paths: this.app.paths,
    });
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(databaseManagerToken)?.destroy();
  }

  private getDatabaseConfig(): AppDatabaseConfig {
    return this.app.config.get<AppDatabaseConfig>('database')!;
  }
}
