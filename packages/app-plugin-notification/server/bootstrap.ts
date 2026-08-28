import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type { DatabaseManager } from '@nocobase/app-database';
import type { Logging } from '@nocobase/logging';
import type { NocoBaseQueueManager } from '@nocobase/queue';

import { createNotificationManager } from './manager.js';
import type {
  NotificationChannelMap,
  NotificationConfig,
  NotificationService,
} from './types.js';

export interface NotificationPluginServices {
  notification?: NotificationService;
}

export interface NotificationPluginDeps {
  readonly database?: DatabaseManager;
  readonly logging: Pick<Logging, 'getLogger'>;
  readonly queueManager: NocoBaseQueueManager;
}

export interface NotificationPluginConfig {
  readonly notification: NotificationConfig;
}

export type NotificationPluginServerContext = AppPluginServerContext<
  NotificationPluginDeps,
  NotificationPluginServices,
  NotificationPluginConfig
>;

export default function bootstrapNotificationPlugin({
  config,
  deps,
  lifecycle,
  services,
}: NotificationPluginServerContext): void {
  if (!deps.database) return;

  const notification = createNotificationManager<NotificationChannelMap>({
    database: deps.database,
    queue: deps.queueManager,
    logger: deps.logging.getLogger().child({ module: 'notification' }),
    config: config.notification,
  });
  services.notification = notification;

  lifecycle.registerDisposer('manager', () => notification.close());
}
