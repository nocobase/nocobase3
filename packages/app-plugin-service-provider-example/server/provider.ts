import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import { HeartbeatService } from './service.js';
import { heartbeatServiceToken } from './token.js';

export interface ServiceProviderExampleApplication {
  readonly container: ServiceContainer;
}

export default class ServiceProviderExampleProvider extends ServiceProvider<ServiceProviderExampleApplication> {
  public readonly name: string =
    '@nocobase/app-plugin-service-provider-example';

  public override register(): void {
    this.app.container.singleton(
      heartbeatServiceToken,
      () => new HeartbeatService(),
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
