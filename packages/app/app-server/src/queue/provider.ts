import { databaseManagerToken } from '@nocobase/db';
import {
  createQueueJobFactoryRegistry,
  createQueueManager,
  type NocoBaseQueueManager,
} from '@nocobase/queue';
import {
  ServiceProvider,
  type ServiceResolver,
} from '@nocobase/service-provider';

import { loggingToken } from '../logging/index.js';
import type { AppPluginApplication } from '../plugins/index.js';
import { queueConfig } from './config.js';
import { queueJobFactoryRegistryToken, queueManagerToken } from './token.js';

export class QueueProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-server/queue';

  public override register(): void {
    this.app.container.singleton(queueJobFactoryRegistryToken, (container) => {
      const database = container.has(databaseManagerToken)
        ? container.resolve(databaseManagerToken)
        : undefined;
      const logger = container
        .resolve(loggingToken)
        .getLogger()
        .child({ module: 'queue' });
      return createQueueJobFactoryRegistry(
        (JobClass) => new JobClass({ database, logger }),
      );
    });
    this.app.container.singleton(queueManagerToken, (container) =>
      this.create(container),
    );
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(queueManagerToken)?.close();
  }

  private create(container: ServiceResolver): NocoBaseQueueManager {
    const database = container.has(databaseManagerToken)
      ? container.resolve(databaseManagerToken)
      : undefined;
    const logger = container
      .resolve(loggingToken)
      .getLogger()
      .child({ module: 'queue' });
    return createQueueManager(this.app.config.get(queueConfig), {
      database,
      logger,
      jobFactory: (JobClass) =>
        container.resolve(queueJobFactoryRegistryToken).create(JobClass),
    });
  }
}
