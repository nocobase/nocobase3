import {
  createAppPluginServiceToken,
  type AppPluginServiceToken,
} from '@nocobase/app-server-kit/plugins';
import type { Hono } from 'hono';

import type { NotificationRegistry } from './registry.js';
import type {
  NotificationChannelMap,
  NotificationSendInput,
  NotificationSendResult,
} from './types.js';

export interface NotificationPluginManager {
  readonly registry: NotificationRegistry;
  readonly router: Hono;
  send(
    input: NotificationSendInput<NotificationChannelMap>,
  ): Promise<NotificationSendResult>;
}

export interface NotificationPluginService {
  readonly manager: NotificationPluginManager;
}

export const notificationPluginServiceToken: AppPluginServiceToken<NotificationPluginService> =
  createAppPluginServiceToken<NotificationPluginService>(
    '@nocobase/app-plugin-notification',
  );
