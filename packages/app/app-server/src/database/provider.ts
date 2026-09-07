import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import { createAppDatabaseManager } from './manager.js';
import { createAppMigrator } from './migrator.js';
import { createAppSeeder } from './seeder.js';
import { prepareAppDatabaseStorage } from './storage.js';
import { databaseConfig } from './config.js';
import type { AppConfigAccessor, ConfigPaths } from '../config/index.js';
import type { AppDatabaseConfig } from './types.js';
import {
  databaseLifecycleObserverToken,
  type DatabaseLifecyclePhase,
  type DatabaseLifecycleResult,
} from './lifecycle-observer.js';

export interface DatabaseProviderApplication {
  readonly config: AppConfigAccessor;
  readonly container: ServiceContainer;
  readonly paths: ConfigPaths;
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
    await prepareAppDatabaseStorage(config, this.app.paths);
    const database = container.resolve(databaseManagerToken);

    if (config.migrations.autoRun) {
      await this.runObserved('migrations', () =>
        createAppMigrator({
          database,
          config: config.migrations,
          sources: config.migrations.sources,
        }).latest(),
      );
    }

    if (config.seeds?.autoRun) {
      const seeds = config.seeds;
      await this.runObserved('seeds', () =>
        createAppSeeder({
          database,
          config: seeds,
          sources: seeds.sources,
        }).run(),
      );
    }
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(databaseManagerToken)?.destroy();
  }

  private getDatabaseConfig(): AppDatabaseConfig {
    return this.app.config.get(databaseConfig);
  }

  private async runObserved(
    phase: DatabaseLifecyclePhase,
    run: () => Promise<{ status: 'completed' | 'skipped' }>,
  ): Promise<void> {
    const observer = this.app.container.has(databaseLifecycleObserverToken)
      ? this.app.container.resolve(databaseLifecycleObserverToken)
      : undefined;
    // Admission failures are not failed DDL: the task has not started yet.
    await observer?.before(phase);
    const observe = async (result: DatabaseLifecycleResult): Promise<void> => {
      if (!observer) return;
      try {
        await observer.after(result);
      } catch {
        console.error('Database lifecycle observation failed.', {
          code: 'DATABASE_LIFECYCLE_OBSERVATION_FAILED',
          phase,
        });
      }
    };
    let result: { status: 'completed' | 'skipped' };
    try {
      result = await run();
    } catch (error) {
      await observe({ phase, outcome: 'failed', code: 'DATABASE_TASK_FAILED' });
      throw error;
    }
    await observe({
      phase,
      outcome: result.status === 'completed' ? 'success' : 'unknown',
      code:
        result.status === 'completed'
          ? 'DATABASE_TASK_COMPLETED'
          : 'DATABASE_TASK_SKIPPED',
    });
  }
}
