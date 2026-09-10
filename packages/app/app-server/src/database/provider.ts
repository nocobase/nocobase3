import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import { createAppDatabaseManager } from './manager.js';
import { executeAppDatabasePlan } from './tasks.js';
import { planAppDatabaseTasks } from './plan.js';
import { prepareAppDatabaseStorage } from './storage.js';
import { databaseConfig } from './config.js';
import type { AppConfigAccessor, ConfigPaths } from '../config/index.js';
import type { AppDatabaseConfig } from './types.js';

export interface DatabaseProviderApplication {
  readonly config: AppConfigAccessor;
  readonly container: ServiceContainer;
  readonly paths: ConfigPaths;
  readonly databaseDrivers?: AppDatabaseConfig['drivers'];
}

export class DatabaseProvider extends ServiceProvider<DatabaseProviderApplication> {
  public readonly name: string = '@nocobase/app-server/database';

  public override register(): void {
    const config = this.getDatabaseConfig();
    if (config.default === 'none') {
      return;
    }

    this.app.container.singleton(databaseManagerToken, () => {
      const database = createAppDatabaseManager(
        config,
        this.app.paths,
        this.app.databaseDrivers,
      );
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
    const plan = planAppDatabaseTasks(
      config,
      this.app.paths,
      ['migrations', 'seeds'],
      { autoRun: true },
      this.app.databaseDrivers,
    );
    // All SQLite connections must be usable by runtime services even without automatic tasks.
    await prepareAppDatabaseStorage(
      config,
      this.app.paths,
      Object.keys(config.connections),
      this.app.databaseDrivers,
    );
    const database = container.resolve(databaseManagerToken);
    await executeAppDatabasePlan(
      database,
      config,
      this.app.paths,
      plan,
      this.app.databaseDrivers,
    );
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(databaseManagerToken)?.destroy();
  }

  private getDatabaseConfig(): AppDatabaseConfig {
    return this.app.config.get(databaseConfig);
  }
}
