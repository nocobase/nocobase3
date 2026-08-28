import { ServiceProvider } from '@nocobase/service-provider';
import { createRealtimeService } from './service.js';
import { realtimeServiceToken } from './types.js';

export class RealtimeProvider<
  TRuntime = unknown,
> extends ServiceProvider<TRuntime> {
  public readonly name: string = 'realtime';

  public override register(): void {
    this.context.serviceContainer.singleton(realtimeServiceToken, () =>
      createRealtimeService(),
    );
  }

  public override shutdown(): Promise<void> {
    this.context.serviceContainer
      .resolveIfCreated(realtimeServiceToken)
      ?.close();
    return Promise.resolve();
  }
}
