import { databaseManagerToken } from '@nocobase/app-database';
import { loggingToken } from '@nocobase/logging';
import {
  ServiceProvider,
  type ServiceResolver,
} from '@nocobase/service-provider';

import { createSyncQueueConfig } from './config.js';
import { createQueueManager } from './manager.js';
import { queueManagerToken } from './token.js';
import type { AppQueueConfig, NocoBaseQueueManager } from './types.js';

export interface QueueProviderRuntimeConfig {
  readonly queue?: AppQueueConfig;
}

export interface QueueProviderRuntime<
  TConfig extends QueueProviderRuntimeConfig = QueueProviderRuntimeConfig,
> {
  readonly config: TConfig;
}

export class QueueProvider<
  TRuntime extends QueueProviderRuntime = QueueProviderRuntime,
> extends ServiceProvider<TRuntime> {
  public readonly name: string = '@nocobase/queue';

  public override register(): void {
    this.context.serviceContainer.singleton(queueManagerToken, (services) =>
      this.createQueueManager(services),
    );
  }

  public override async shutdown(): Promise<void> {
    await this.context.serviceContainer
      .resolveIfCreated(queueManagerToken)
      ?.close();
  }

  private createQueueManager(services: ServiceResolver): NocoBaseQueueManager {
    const logging = services.resolve(loggingToken);
    const database = services.has(databaseManagerToken)
      ? services.resolve(databaseManagerToken)
      : undefined;
    const logger = logging.getLogger().child({ module: 'queue' });

    return createQueueManager(
      this.context.runtime.config.queue ?? createSyncQueueConfig(),
      {
        database,
        logger,
        jobFactory: (JobClass) => new JobClass({ database, logger }),
      },
    );
  }
}
