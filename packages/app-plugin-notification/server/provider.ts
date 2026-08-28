import { databaseManagerToken } from '@nocobase/app-database';
import { loggingToken } from '@nocobase/logging';
import { queueManagerToken } from '@nocobase/queue';
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import { createNotificationManager } from './manager.js';
import { notificationServiceToken } from './token.js';
import type { NotificationChannelMap, NotificationConfig } from './types.js';

export interface NotificationProviderApplicationConfig {
  readonly notification?: NotificationConfig;
}

export interface NotificationProviderApplication {
  readonly config: NotificationProviderApplicationConfig;
  readonly container: ServiceContainer;
}

export default class NotificationProvider<
  TApplication extends NotificationProviderApplication =
    NotificationProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/app-plugin-notification';

  public override register(): void {
    if (!this.app.container.has(databaseManagerToken)) return;
    this.app.container.singleton(notificationServiceToken, (container) =>
      createNotificationManager<NotificationChannelMap>({
        database: container.resolve(databaseManagerToken),
        queue: container.resolve(queueManagerToken),
        logger: container.resolve(loggingToken).getLogger().child({
          module: 'notification',
        }),
        config: this.app.config.notification ?? { channels: [] },
      }),
    );
  }

  public override async start(): Promise<void> {
    if (!this.app.container.has(notificationServiceToken)) return;
    await this.app.container.resolve(notificationServiceToken).start();
  }

  public override async shutdown(): Promise<void> {
    await this.app.container
      .resolveIfCreated(notificationServiceToken)
      ?.close();
  }
}
