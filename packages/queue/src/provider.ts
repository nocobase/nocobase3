import { databaseManagerToken } from '@nocobase/app-database';
import { loggingToken } from '@nocobase/logging';
import {
  ServiceProvider,
  type ServiceContainer,
  type ServiceResolver,
} from '@nocobase/service-provider';

import { createSyncQueueConfig } from './config.js';
import { createQueueManager } from './manager.js';
import { queueManagerToken } from './token.js';
import type { AppQueueConfig, NocoBaseQueueManager } from './types.js';

export interface QueueProviderApplicationConfig {
  readonly queue?: AppQueueConfig;
}

export interface QueueProviderApplication<
  TConfig extends QueueProviderApplicationConfig =
    QueueProviderApplicationConfig,
> {
  readonly config: TConfig;
  readonly container: ServiceContainer;
}

export class QueueProvider<
  TApplication extends QueueProviderApplication = QueueProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/queue';

  public override register(): void {
    this.app.container.singleton(queueManagerToken, (container) =>
      this.createQueueManager(container),
    );
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(queueManagerToken)?.close();
  }

  private createQueueManager(container: ServiceResolver): NocoBaseQueueManager {
    const logging = container.resolve(loggingToken);
    const database = container.has(databaseManagerToken)
      ? container.resolve(databaseManagerToken)
      : undefined;
    const logger = logging.getLogger().child({ module: 'queue' });

    return createQueueManager(
      this.app.config.queue ?? createSyncQueueConfig(),
      {
        database,
        logger,
        jobFactory: (JobClass) => new JobClass({ database, logger }),
      },
    );
  }
}
