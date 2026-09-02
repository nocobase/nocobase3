import { databaseManagerToken } from '@nocobase/db';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import { loggingToken } from '@nocobase/app-server/logging';
import { queueManagerToken } from '@nocobase/app-server/queue';
import { ServiceProvider } from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';

import { createNotificationManager } from '../manager.js';
import { createNotificationRegistry } from '../registry.js';
import { notificationRuntimeToken } from '../runtime.js';
import {
  notificationExtensionRegistryToken,
  notificationServiceToken,
} from '../tokens.js';
import type { NotificationChannelMap, NotificationConfig } from '../types.js';
import { notificationConfig } from '../config.js';

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
    if (!this.app.container.has(databaseManagerToken))
      throw new Error(
        'Notification core requires the database manager dependency.',
      );
    if (!this.app.container.has(queueManagerToken))
      throw new Error(
        'Notification core requires the queue manager dependency.',
      );
    if (!this.app.container.has(loggingToken))
      throw new Error('Notification core requires the logging dependency.');
    const registry = createNotificationRegistry();
    this.app.container.instance(notificationExtensionRegistryToken, registry);
    this.app.container.singleton(notificationRuntimeToken, (container) =>
      createNotificationManager<NotificationChannelMap>({
        database: container.resolve(databaseManagerToken),
        queue: container.resolve(queueManagerToken),
        logger: container.resolve(loggingToken).getLogger().child({
          module: 'notification',
        }),
        config: this.app.config.get(notificationConfig),
        registry,
      }),
    );
    this.app.container.singleton(notificationServiceToken, (container) =>
      container.resolve(notificationRuntimeToken),
    );
  }

  public override async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) {
      throw new Error(
        'Notification core requires the authorization dependency.',
      );
    }
    registerNotificationAuthorization(
      this.app.container.resolve(authorizationToken),
    );
  }

  public override async start(): Promise<void> {
    // Install mode starts providers before notification tables are migrated.
    this.app.container.resolve(notificationRuntimeToken).activate();
  }

  public override async shutdown(): Promise<void> {
    await this.app.container
      .resolveIfCreated(notificationRuntimeToken)
      ?.close();
  }
}

export function registerNotificationAuthorization(
  authorization: Pick<AppAuthorization, 'resources'>,
): void {
  authorization.resources.add({
    resourceType: 'notification',
    async authorize(request, context) {
      if (request.resource.id !== 'test' || request.action !== 'send') {
        return {
          effect: 'deny',
          reasons: [
            {
              code: 'NOTIFICATION_ACTION_NOT_SUPPORTED',
              message: `Notification authorization does not support "${request.resource.id}:${request.action}"`,
              plugin: 'notification',
            },
          ],
        };
      }
      const grants = await context.grants.resolve({
        principal: request.principal,
        subjects: request.subjects,
        resource: request.resource,
        action: request.action,
      });
      const staticGrants = grants.filter((grant) => grant.policy === undefined);
      return staticGrants.length > 0
        ? {
            effect: 'permit',
            reasons: staticGrants.map((grant) => ({
              code: 'NOTIFICATION_TEST_SEND_GRANTED',
              message: `${grant.source.plugin}:${grant.source.id} allows notification test sending`,
              plugin: 'notification',
            })),
          }
        : {
            effect: 'deny',
            reasons: [
              {
                code: 'NOTIFICATION_TEST_SEND_DENIED',
                message: 'Notification test sending is not allowed',
                plugin: 'notification',
              },
            ],
          };
    },
  });
}
