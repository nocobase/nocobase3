import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type {
  NotificationChannelDefinition,
  NotificationProviderDefinition,
} from '@nocobase/app-plugin-notification';
import type { Hono } from 'hono';

import {
  createDatabaseProviderDefinition,
  createInAppChannelDefinition,
} from './index.js';
import { createInAppTestRouter, type InAppTestSender } from './test-router.js';

interface NotificationPluginDependencies {
  readonly auth: {
    getSession(headers: Headers): Promise<{
      readonly user: { readonly id: string };
    } | null>;
  };
}

interface NotificationRegistrar {
  registerChannel(
    definition: NotificationChannelDefinition,
  ): NotificationRegistrar;
  registerProvider(
    channelType: string,
    definition: NotificationProviderDefinition,
  ): NotificationRegistrar;
}

interface NotificationPluginServices {
  readonly notification?: InAppTestSender & { readonly router: Hono };
  readonly notificationRegistry?: NotificationRegistrar;
}

interface NotificationPluginConfig {
  readonly app: { readonly nocoBaseApiUrl?: string };
  readonly server: { readonly viteDevUrl?: URL };
}

type NotificationPluginContext = AppPluginServerContext<
  NotificationPluginDependencies,
  NotificationPluginServices,
  NotificationPluginConfig
>;

export default function bootstrap({
  config,
  deps,
  services,
}: NotificationPluginContext): void {
  const notification = services.notification;
  if (notification) {
    notification.router.route('/test', createInAppTestRouter(notification));
  }
  services.notificationRegistry
    ?.registerChannel(
      createInAppChannelDefinition({
        resolveUserId: createNotificationUserIdResolver(
          deps.auth,
          config?.app.nocoBaseApiUrl,
          config?.server.viteDevUrl ? '1' : undefined,
        ),
      }),
    )
    .registerProvider('in-app', createDatabaseProviderDefinition());
}

function createNotificationUserIdResolver(
  auth: NotificationPluginDependencies['auth'],
  apiUrl: string | undefined,
  developmentFallbackUserId: string | undefined,
): (request: Request) => Promise<string | undefined> {
  const normalizedApiUrl = apiUrl?.trim();
  const endpoint = normalizedApiUrl
    ? new URL('auth:check', `${normalizedApiUrl.replace(/\/$/, '')}/`)
    : undefined;

  return async (request: Request): Promise<string | undefined> => {
    if (!endpoint) {
      const session = await auth.getSession(request.headers);
      return session?.user.id ?? developmentFallbackUserId;
    }

    const headers = forwardedAuthenticationHeaders(request.headers);
    if (!headers.has('authorization') && !headers.has('cookie')) {
      return developmentFallbackUserId;
    }

    try {
      const response = await fetch(endpoint, { method: 'POST', headers });
      if (!response.ok) return developmentFallbackUserId;
      return (
        userIdFromResponse(await response.json().catch(() => undefined)) ??
        developmentFallbackUserId
      );
    } catch {
      return developmentFallbackUserId;
    }
  };
}

function forwardedAuthenticationHeaders(source: Headers): Headers {
  const headers = new Headers({ accept: 'application/json' });
  for (const name of [
    'authorization',
    'cookie',
    'x-authenticator',
    'x-portal',
    'x-role',
  ]) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function userIdFromResponse(value: unknown): string | undefined {
  const user =
    value && typeof value === 'object' && 'data' in value ? value.data : value;
  if (!user || typeof user !== 'object' || !('id' in user)) return undefined;
  return typeof user.id === 'string' || typeof user.id === 'number'
    ? String(user.id)
    : undefined;
}
