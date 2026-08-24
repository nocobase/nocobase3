import type { AppPluginServerContext } from '@nocobase/app-server/plugins';
import type {
  NotificationChannelDefinition,
  NotificationProviderDefinition,
} from '@nocobase/notification';

import {
  createEmailChannelDefinition,
  createSmtpProviderDefinition,
} from './email/index.js';

interface NotificationRegistrar {
  registerChannel(
    definition: NotificationChannelDefinition,
  ): NotificationRegistrar;
  registerProvider(
    channelType: string,
    definition: NotificationProviderDefinition,
  ): NotificationRegistrar;
}

interface NotificationProviderPluginServices {
  readonly notification?: NotificationRegistrar;
}

type NotificationProviderPluginContext = AppPluginServerContext<
  unknown,
  NotificationProviderPluginServices
>;

export default function bootstrap({
  services,
}: NotificationProviderPluginContext): void {
  services.notification
    ?.registerChannel(createEmailChannelDefinition())
    .registerProvider('email', createSmtpProviderDefinition());
}
