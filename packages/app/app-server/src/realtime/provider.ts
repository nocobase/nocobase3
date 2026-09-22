import { loggingToken } from '../logging/token.js';
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';
import { createRealtimeService } from './service.js';
import { realtimeServiceToken } from './types.js';

export interface RealtimeProviderApplication {
  readonly container: ServiceContainer;
}

export class RealtimeProvider<
  TApplication extends RealtimeProviderApplication =
    RealtimeProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = 'realtime';

  public override register(): void {
    this.app.container.singleton(realtimeServiceToken, () =>
      createRealtimeService({
        logger: this.app.container.has(loggingToken)
          ? this.app.container.resolve(loggingToken).getLogger('realtime')
          : undefined,
      }),
    );
  }

  public override shutdown(): Promise<void> {
    this.app.container.resolveIfCreated(realtimeServiceToken)?.close();
    return Promise.resolve();
  }
}
