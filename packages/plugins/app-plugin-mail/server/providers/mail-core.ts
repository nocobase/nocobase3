import { ServiceProvider } from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import { loggingToken } from '@nocobase/app-server/logging';
import { queueManagerToken } from '@nocobase/app-server/queue';

import { createMailProviderAdapterResolver } from '../adapter-resolver.js';
import { createMailProviderRegistry } from '../registry.js';
import { createMailRuntime } from '../runtime.js';
import { DefaultMailService } from '../service.js';
import { createDatabaseMailStore } from '../store.js';
import {
  mailProviderAdapterResolverToken,
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
    this.app.container.singleton(mailProviderAdapterResolverToken, () =>
      createMailProviderAdapterResolver({
        registry,
        context: { publicBasePath: this.app.publicBasePath },
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
        }),
    );
  }

  public override start(): Promise<void> {
    this.app.container.resolve(mailRuntimeToken).start();
    return Promise.resolve();
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(mailRuntimeToken)?.close();
  }
}
