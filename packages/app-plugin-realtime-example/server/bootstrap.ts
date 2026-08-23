import type { AppPluginServerContext } from '@nocobase/app-server/plugins';

import {
  startClockPublisher,
  type ClockPublisherRealtime,
} from './publishers/clock.js';

export interface RealtimeExamplePluginServerServices {
  realtime: ClockPublisherRealtime;
}

export type RealtimeExamplePluginServerContext = AppPluginServerContext<
  unknown,
  RealtimeExamplePluginServerServices
>;

export default function bootstrapRealtimeExamplePlugin({
  lifecycle,
  services,
}: RealtimeExamplePluginServerContext): void {
  lifecycle.registerDisposer(
    'clock-publisher',
    startClockPublisher(services.realtime),
  );
}
