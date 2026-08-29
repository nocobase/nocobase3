import { databaseManagerToken } from '@nocobase/app-database';
import { loggingToken } from '@nocobase/logging';
import { queueManagerToken } from '@nocobase/queue';
import { ServiceProvider } from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';

import { createNotificationManager } from '../manager.js';
import { notificationServiceToken } from '../tokens.js';
import type { NotificationChannelMap, NotificationConfig } from '../types.js';

export interface NotificationProviderApplicationConfig {
  readonly app: {
    readonly publicBasePath: string;
  };
  readonly notification?: NotificationConfig;
}

export type NotificationProviderApplication =
  AppPluginApplication<NotificationProviderApplicationConfig>;

export class NotificationProvider<
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
    // Install mode starts providers before notification tables are migrated.
    this.app.container.resolve(notificationServiceToken).activate();
  }

  public override async shutdown(): Promise<void> {
    await this.app.container
      .resolveIfCreated(notificationServiceToken)
      ?.close();
  }
}
