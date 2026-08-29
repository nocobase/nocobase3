import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/app-database';
import { createAppDatabaseManager } from './manager.js';
import { createAppMigrator } from './migrator.js';
import { createAppSeeder } from './seeder.js';
import { prepareAppDatabaseStorage } from './storage.js';
import type { AppDatabaseConfig } from './types.js';

export interface DatabaseProviderApplicationConfig {
  readonly database: AppDatabaseConfig;
}

export interface DatabaseProviderApplication<
  TConfig extends DatabaseProviderApplicationConfig =
    DatabaseProviderApplicationConfig,
> {
  readonly config: TConfig;
  readonly container: ServiceContainer;
}

export class DatabaseProvider<
  TApplication extends DatabaseProviderApplication =
    DatabaseProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/app-server-kit/database';

  public override register(): void {
    const config = this.app.config.database;
    if (config.default === 'none') {
      return;
    }

    this.app.container.singleton(databaseManagerToken, () => {
      const database = createAppDatabaseManager(config);
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

    const config = this.app.config.database;
    await prepareAppDatabaseStorage(config);
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
}
