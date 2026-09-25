import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import { createAppDatabaseManager } from './manager.js';
import {
  executeAppDatabasePlan,
  type AppDatabaseTasksResult,
} from './tasks.js';
import { planAppRuntimeDatabaseTasks } from './plan.js';
import { prepareAppDatabaseStorage } from './storage.js';
import { loggingToken } from '../logging/token.js';
import type { Logger } from '@nocobase/logging';
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
    const result = await executeAppDatabasePlan(database, config, plan, {
      runtimeConfig: this.app.config,
      container: this.app.container,
      paths: this.app.paths,
    });
    this.reportChecksumWarnings(result);
  }

  /**
   * Automatic startup tasks have no console to report to, so drift tolerated by
   * the `warn` policy is only visible if it reaches the application log.
   */
  private reportChecksumWarnings(result: AppDatabaseTasksResult): void {
    const { container } = this.app;
    if (!container.has(loggingToken)) return;
    let logger: Logger | undefined;
    for (const entry of result.results) {
      for (const warning of entry.warnings ?? []) {
        logger ??= container.resolve(loggingToken).getLogger('database');
        logger.warn(
          {
            connection: entry.connection,
            kind: entry.kind,
            package: warning.packageName,
            name: warning.name,
            recordedChecksum: warning.recordedChecksum,
            sourceChecksum: warning.sourceChecksum,
          },
          `Executed ${entry.kind === 'migrations' ? 'migration' : 'seed'} "${warning.name}" no longer matches its source. Run "nocobase db repair" when the edit left the schema identical, or "nocobase db redo" when it changed what ran.`,
        );
      }
    }
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(databaseManagerToken)?.destroy();
  }

  private getDatabaseConfig(): AppDatabaseConfig {
    return this.app.config.get<AppDatabaseConfig>('database')!;
  }
}
