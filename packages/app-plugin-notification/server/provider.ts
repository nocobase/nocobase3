import { databaseManagerToken } from '@nocobase/app-database';
import { loggingToken } from '@nocobase/app-server-kit/logging';
import { queueManagerToken } from '@nocobase/app-server-kit/queue';
import { ServiceProvider } from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';

import { notificationConfig } from './config.js';
import { createNotificationManager } from './manager.js';
import { notificationServiceToken } from './token.js';
import type { NotificationChannelMap } from './types.js';

export type NotificationProviderApplication = AppPluginApplication;

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
        config: this.app.config.get(notificationConfig),
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
