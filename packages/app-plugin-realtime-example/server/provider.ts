import { realtimeServiceToken } from '@nocobase/app-server-kit/realtime';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  startClockPublisher,
  type ClockPublisherRealtime,
} from './publishers/clock.js';

export default class RealtimeExampleProvider extends ServiceProvider {
  public readonly name: string = '@nocobase/app-plugin-realtime-example';

  private stopClockPublisher: (() => void) | undefined;

  public override start(): Promise<void> {
    const realtime: ClockPublisherRealtime =
      this.context.serviceContainer.resolve(realtimeServiceToken);
    this.stopClockPublisher = startClockPublisher(realtime);
    return Promise.resolve();
  }

  public override shutdown(): Promise<void> {
    this.stopClockPublisher?.();
    this.stopClockPublisher = undefined;
    return Promise.resolve();
  }
}
