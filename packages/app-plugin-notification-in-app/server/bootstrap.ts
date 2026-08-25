import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import {
  notificationPluginServiceToken,
  type NotificationConfig,
} from '@nocobase/app-plugin-notification';

import {
  createDatabaseProviderDefinition,
  createInAppChannelDefinition,
} from './definition.js';
import { createInAppRouter, type InAppUserIdResolver } from './router.js';
import { createInAppStore } from './store.js';
import { createInAppTestRouter } from './test-router.js';

interface NotificationPluginDependencies {
  readonly resolveRequestUserId: InAppUserIdResolver;
}

interface InAppPluginConfig {
  readonly database: import('@nocobase/app-server-kit/database').AppDatabaseConfig;
  readonly notification: NotificationConfig & { readonly enabled: boolean };
}

type NotificationPluginContext = AppPluginServerContext<
  NotificationPluginDependencies,
  unknown,
  AppRuntime<InAppPluginConfig>
>;

export default function bootstrap({
  deps,
  pluginServices,
  runtime,
}: NotificationPluginContext): void {
  if (!runtime.config.notification.enabled) return;
  pluginServices.onAvailable(
    notificationPluginServiceToken,
    (notification): void => {
      const store = createInAppStore(runtime.database);
      notification.manager.registry
        .registerChannel(createInAppChannelDefinition())
        .registerProvider(
          'in-app',
          createDatabaseProviderDefinition({ store }),
        );
      notification.manager.router.route(
        '/in-app',
        createInAppRouter(store, { resolveUserId: deps.resolveRequestUserId }),
      );
      notification.manager.router.route(
        '/test',
        createInAppTestRouter(notification.manager),
      );
    },
  );
}
