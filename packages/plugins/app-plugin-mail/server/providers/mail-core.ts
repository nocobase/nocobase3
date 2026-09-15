import { ServiceProvider } from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import { loggingToken } from '@nocobase/app-server/logging';
import { queueManagerToken } from '@nocobase/app-server/queue';
import {
  driveManagerToken,
  type AppDriveConfig,
} from '@nocobase/app-server/drive';
import {
  realtimeServiceToken,
  type RealtimeUserTopic,
} from '@nocobase/app-server/realtime';

import { createMailProviderAdapterResolver } from '../adapter-resolver.js';
import {
  resolveMailAutomaticSyncIntervalFromMs,
  type MailConfig,
} from '../config.js';
import { createDatabaseMailCredentialVault } from '../credentials.js';
import { createMailProviderRegistry } from '../registry.js';
import { createMailRuntime } from '../runtime.js';
import { DefaultMailService } from '../service.js';
import { DriveMailOutboundAttachmentStorage } from '../outbound-attachments.js';
import {
  createMailMessageChangeNotifier,
  MAIL_REALTIME_TOPIC,
  type MailMessageChangeNotifier,
  type MailRealtimeEvent,
} from '../realtime.js';
import { createDatabaseMailStore } from '../store.js';
import {
  mailProviderAdapterResolverToken,
  mailCredentialVaultToken,
  mailProviderRegistryToken,
  mailRuntimeToken,
  mailServiceToken,
  mailOutboundAttachmentStorageToken,
  mailStoreToken,
} from '../tokens.js';

export type MailCoreProviderApplication = AppPluginApplication;

export class MailCoreProvider extends ServiceProvider<MailCoreProviderApplication> {
  public readonly name: string = '@nocobase/app-plugin-mail';
  private realtimeTopic?: RealtimeUserTopic<MailRealtimeEvent>;
  private messageChangeNotifier?: MailMessageChangeNotifier;

  public override register(): void {
    const registry = createMailProviderRegistry();
    this.app.container.instance(mailProviderRegistryToken, registry);
    this.app.container.singleton(mailStoreToken, (container) =>
      createDatabaseMailStore(container.resolve(databaseManagerToken)),
    );
    if (!this.app.container.has(mailCredentialVaultToken)) {
      this.app.container.singleton(mailCredentialVaultToken, (container) =>
        createDatabaseMailCredentialVault(
          container.resolve(databaseManagerToken),
        ),
      );
    }
    this.app.container.singleton(
      mailProviderAdapterResolverToken,
      (container) =>
        createMailProviderAdapterResolver({
          registry,
          context: {
            publicBasePath: this.app.publicBasePath,
            credentials: container.resolve(mailCredentialVaultToken),
          },
          resolveConfig: (account) =>
            this.resolveProviderConfig(account.provider),
        }),
    );
    this.app.container.singleton(mailRuntimeToken, (container) =>
      createMailRuntime({
        store: container.resolve(mailStoreToken),
        adapters: container.resolve(mailProviderAdapterResolverToken),
        queue: container.resolve(queueManagerToken),
        queueName: `mail:${this.app.appName}`,
        automaticSyncIntervalMs:
          this.app.config.get<MailConfig>('mail')!.automaticSyncIntervalMs,
        syncBatchSize: this.app.config.get<MailConfig>('mail')!.syncBatchSize,
        pushWebhookUrl: this.app.config.get<MailConfig>('mail')!.pushWebhookUrl,
        pushWebhookSecret:
          this.app.config.get<MailConfig>('mail')!.pushWebhookSecret,
        outboundAttachments: container.resolve(
          mailOutboundAttachmentStorageToken,
        ),
        credentials: container.resolve(mailCredentialVaultToken),
        logger: container
          .resolve(loggingToken)
          .getLogger()
          .child({ module: 'mail' }),
        messageChangeNotifier: this.messageChangeNotifier,
      }),
    );
    this.app.container.singleton(
      mailOutboundAttachmentStorageToken,
      (container) =>
        new DriveMailOutboundAttachmentStorage(
          container.resolve(mailStoreToken),
          container.resolve(driveManagerToken),
          this.app.config.get<AppDriveConfig>('drive')!.default,
        ),
    );
    this.app.container.singleton(
      mailServiceToken,
      (container) =>
        new DefaultMailService({
          store: container.resolve(mailStoreToken),
          adapters: container.resolve(mailProviderAdapterResolverToken),
          outbox: container.resolve(mailRuntimeToken),
          syncBatchSize: this.app.config.get<MailConfig>('mail')!.syncBatchSize,
          defaultAutomaticSyncIntervalMinutes:
            resolveMailAutomaticSyncIntervalFromMs(
              this.app.config.get<MailConfig>('mail')!.automaticSyncIntervalMs,
            ),
          registry,
          providerContext: {
            publicBasePath: this.app.publicBasePath,
            credentials: container.resolve(mailCredentialVaultToken),
          },
          credentials: container.resolve(mailCredentialVaultToken),
          resolveProviderConfig: (provider) =>
            this.resolveProviderConfig(provider),
          listProviderConfigs: () => this.listProviderConfigs(),
          outboundAttachments: container.resolve(
            mailOutboundAttachmentStorageToken,
          ),
          messageChangeNotifier: this.messageChangeNotifier,
        }),
    );
  }

  public override boot(): Promise<void> {
    if (this.app.container.has(realtimeServiceToken)) {
      this.realtimeTopic = this.app.container
        .resolve(realtimeServiceToken)
        .defineTopic<MailRealtimeEvent, 'user'>(MAIL_REALTIME_TOPIC, {
          audience: 'user',
        });
      this.messageChangeNotifier = createMailMessageChangeNotifier(
        this.realtimeTopic,
      );
    }
    return Promise.resolve();
  }

  private listProviderConfigs(): readonly import('../types.js').MailProviderConfig[] {
    return Object.entries(
      this.app.config.get<MailConfig>('mail')!.providers,
    ).map(([name, config]) => ({ ...config, name }));
  }

  private resolveProviderConfig(
    provider: import('../types.js').MailProviderIdentity,
  ): import('../types.js').MailProviderConfig {
    const config =
      this.app.config.get<MailConfig>('mail')!.providers[provider.name];
    if (!config || config.type !== provider.type || config.enabled === false) {
      throw new Error(
        `Mail Provider configuration "${provider.name}" is unavailable.`,
      );
    }
    return { ...config, name: provider.name };
  }

  public override start(): Promise<void> {
    this.app.container.resolve(mailRuntimeToken).start();
    return Promise.resolve();
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(mailRuntimeToken)?.close();
    this.realtimeTopic?.close();
    this.realtimeTopic = undefined;
    this.messageChangeNotifier = undefined;
  }
}
