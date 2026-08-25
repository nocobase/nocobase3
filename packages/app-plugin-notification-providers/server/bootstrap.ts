import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import { notificationPluginServiceToken } from '@nocobase/app-plugin-notification';

import {
  createEmailChannelDefinition,
  createSmtpProviderDefinition,
} from './email/index.js';
import { createEmailTestRouter } from './email/test-router.js';

export default function bootstrap({
  pluginServices,
}: AppPluginServerContext): void {
  pluginServices.onAvailable(
    notificationPluginServiceToken,
    (notification): void => {
      notification.manager.registry
        .registerChannel(createEmailChannelDefinition())
        .registerProvider('email', createSmtpProviderDefinition());
      notification.manager.router.route(
        '/test',
        createEmailTestRouter(notification.manager),
      );
    },
  );
}
