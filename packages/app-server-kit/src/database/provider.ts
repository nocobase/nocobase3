import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/app-database';
import { createAppDatabaseManager } from './manager.js';
import { createAppMigrator } from './migrator.js';
import { createAppSeeder } from './seeder.js';
import { prepareAppDatabaseStorage } from './storage.js';
import { databaseConfig } from './config.js';
import type { AppConfigAccessor, ConfigPaths } from '../config/index.js';
import type { AppDatabaseConfig } from './types.js';

export interface DatabaseProviderApplication {
  readonly config: AppConfigAccessor;
  readonly container: ServiceContainer;
  readonly paths: ConfigPaths;
}

export class DatabaseProvider extends ServiceProvider<DatabaseProviderApplication> {
  public readonly name: string = '@nocobase/app-server-kit/database';

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
    await prepareAppDatabaseStorage(config, this.app.paths);
    const database = container.resolve(databaseManagerToken);

    if (config.migrations.autoRun) {
      await createAppMigrator({
        database,
        config: config.migrations,
        sources: config.migrations.sources,
      }).latest();
    }

    if (config.seeds?.autoRun) {
      await createAppSeeder({
        database,
        config: config.seeds,
        sources: config.seeds.sources,
      }).run();
    }
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(databaseManagerToken)?.destroy();
  }

  private getDatabaseConfig(): AppDatabaseConfig {
    return this.app.config.get(databaseConfig);
  }
}
