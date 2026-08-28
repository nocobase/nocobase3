import { ServiceProvider } from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/app-database';
import { createAppDatabaseManager } from './manager.js';
import { createAppMigrator } from './migrator.js';
import { createAppSeeder } from './seeder.js';
import { prepareAppDatabaseStorage } from './storage.js';
import type { AppDatabaseConfig } from './types.js';

export interface DatabaseProviderRuntimeConfig {
  readonly database: AppDatabaseConfig;
}

export interface DatabaseProviderRuntime<
  TConfig extends DatabaseProviderRuntimeConfig = DatabaseProviderRuntimeConfig,
> {
  readonly config: TConfig;
}

export class DatabaseProvider<
  TRuntime extends DatabaseProviderRuntime = DatabaseProviderRuntime,
> extends ServiceProvider<TRuntime> {
  public readonly name: string = '@nocobase/app-server-kit/database';

  public override register(): void {
    const config = this.context.runtime.config.database;
    if (config.default === 'none') {
      return;
    }

    this.context.serviceContainer.singleton(databaseManagerToken, () => {
      const database = createAppDatabaseManager(config);
      if (!database) {
        throw new Error('Database is not configured.');
      }

      return database;
    });
  }

  public override async boot(): Promise<void> {
    const { serviceContainer } = this.context;
    if (!serviceContainer.has(databaseManagerToken)) {
      return;
    }

    const config = this.context.runtime.config.database;
    await prepareAppDatabaseStorage(config);
    const database = serviceContainer.resolve(databaseManagerToken);

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
    await this.context.serviceContainer
      .resolveIfCreated(databaseManagerToken)
      ?.destroy();
  }
}
