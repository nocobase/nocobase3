import { ServiceProvider } from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import { loggingToken } from '@nocobase/app-server/logging';
import { queueManagerToken } from '@nocobase/app-server/queue';

import { createMailProviderAdapterResolver } from '../adapter-resolver.js';
import { mailConfig } from '../config.js';
import { createDatabaseMailCredentialVault } from '../credentials.js';
import { createMailProviderRegistry } from '../registry.js';
import { createMailRuntime } from '../runtime.js';
import { DefaultMailService } from '../service.js';
import { createDatabaseMailStore } from '../store.js';
import {
  mailProviderAdapterResolverToken,
  mailCredentialVaultToken,
  mailProviderRegistryToken,
  mailRuntimeToken,
  mailServiceToken,
  mailStoreToken,
} from '../tokens.js';

export type MailCoreProviderApplication = AppPluginApplication;

export class MailCoreProvider extends ServiceProvider<MailCoreProviderApplication> {
  public readonly name: string = '@nocobase/app-plugin-mail';

  public override register(): void {
    const registry = createMailProviderRegistry();
    this.app.container.instance(mailProviderRegistryToken, registry);
    this.app.container.singleton(mailStoreToken, (container) =>
      createDatabaseMailStore(container.resolve(databaseManagerToken)),
    );
    this.app.container.singleton(mailCredentialVaultToken, (container) =>
      createDatabaseMailCredentialVault(
        container.resolve(databaseManagerToken),
        this.app.config.get(mailConfig).credentialEncryptionKey,
      ),
    );
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
        logger: container
          .resolve(loggingToken)
          .getLogger()
          .child({ module: 'mail' }),
      }),
    );
    this.app.container.singleton(
      mailServiceToken,
      (container) =>
        new DefaultMailService({
          store: container.resolve(mailStoreToken),
          adapters: container.resolve(mailProviderAdapterResolverToken),
          outbox: container.resolve(mailRuntimeToken),
          registry,
          providerContext: {
            publicBasePath: this.app.publicBasePath,
            credentials: container.resolve(mailCredentialVaultToken),
          },
          credentials: container.resolve(mailCredentialVaultToken),
          resolveProviderConfig: (provider) =>
            this.resolveProviderConfig(provider),
          listProviderConfigs: () => this.listProviderConfigs(),
        }),
    );
  }

  private listProviderConfigs(): readonly import('../types.js').MailProviderConfig[] {
    return Object.entries(this.app.config.get(mailConfig).providers).map(
      ([name, config]) => ({ ...config, name }),
    );
  }

  private resolveProviderConfig(
    provider: import('../types.js').MailProviderIdentity,
  ): import('../types.js').MailProviderConfig {
    const config = this.app.config.get(mailConfig).providers[provider.name];
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
  }
}
