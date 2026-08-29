import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { HeartbeatService } from './service.js';
import { heartbeatServiceToken } from './token.js';
import { heartbeatConfig } from './config.js';

export type ServiceProviderExampleApplication = AppPluginApplication;

export default class ServiceProviderExampleProvider extends ServiceProvider<ServiceProviderExampleApplication> {
  public readonly name: string =
    '@nocobase/app-plugin-service-provider-example';

  public override register(): void {
    const config = this.app.config.get(heartbeatConfig);
    this.app.container.singleton(
      heartbeatServiceToken,
      () => new HeartbeatService(config.enabled),
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
