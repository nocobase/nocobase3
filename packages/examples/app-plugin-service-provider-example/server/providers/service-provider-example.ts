import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { DefaultHeartbeatService } from '../services/heartbeat.js';
import { heartbeatServiceToken } from '../tokens.js';

export type ServiceProviderExampleApplication = AppPluginApplication;

export class ServiceProviderExampleProvider extends ServiceProvider<ServiceProviderExampleApplication> {
  public readonly name: string =
    '@nocobase/app-plugin-service-provider-example';

  public override register(): void {
    this.app.container.singleton(
      heartbeatServiceToken,
      () => new DefaultHeartbeatService(),
    );
  }

  public override start(): Promise<void> {
    this.app.container.resolve(heartbeatServiceToken).start();
    return Promise.resolve();
  }

  public override ready(): Promise<void> {
    this.app.container.resolve(heartbeatServiceToken).ready();
    return Promise.resolve();
  }

  public override shutdown(): Promise<void> {
    this.app.container.resolveIfCreated(heartbeatServiceToken)?.stop();
    return Promise.resolve();
  }
}
