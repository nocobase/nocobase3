import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { queueServiceToken } from '@nocobase/app-server/queue';
import type { UnregisterHandler } from '@nocobase/queue';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  createQueueExampleHandler,
  queueExampleQueue,
} from './jobs/queue-example.js';
import { QueueExampleService, queueExampleServiceToken } from './service.js';

export class QueueExampleProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-queue-example';
  private unregister: UnregisterHandler | undefined;

  public override register(): void {
    this.app.container.singleton(
      queueExampleServiceToken,
      () => new QueueExampleService(),
    );
  }

  public override async boot(): Promise<void> {
    const queue = this.app.container.resolve(queueServiceToken);
    const service = this.app.container.resolve(queueExampleServiceToken);
    this.unregister = queue
      .consumer(queueExampleQueue)
      .consume(createQueueExampleHandler(service));
  }

  public override async shutdown(): Promise<void> {
    await this.unregister?.();
    this.unregister = undefined;
  }
}
