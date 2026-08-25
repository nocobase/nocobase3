import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import type { Logging } from '@nocobase/logging';
import type { NocoBaseQueueManager } from '@nocobase/queue';

import { createNotificationManager } from './manager.js';
import { notificationPluginServiceToken } from './service.js';
import type { NotificationConfig } from './types.js';

interface NotificationPluginConfig {
  readonly database: import('@nocobase/app-server-kit/database').AppDatabaseConfig;
  readonly notification: NotificationConfig & { readonly enabled: boolean };
}

interface NotificationPluginDeps {
  readonly logging: Logging;
  readonly queueManager: NocoBaseQueueManager;
}

type NotificationPluginContext = AppPluginServerContext<
  NotificationPluginDeps,
  unknown,
  AppRuntime<NotificationPluginConfig>
>;

export default function bootstrap({
  deps,
  lifecycle,
  pluginServices,
  runtime,
}: NotificationPluginContext): void {
  const config = runtime.config.notification;
  if (!config.enabled) return;
  if (!runtime.database) {
    throw new Error('Notifications require a configured database.');
  }
  const manager = createNotificationManager({
    database: runtime.database,
    queue: deps.queueManager,
    logger: deps.logging.getLogger('notification'),
    config,
  });
  manager.activate();
  lifecycle.registerDisposer('manager', (): Promise<void> => manager.close());
  pluginServices.provide(notificationPluginServiceToken, { manager });
}
