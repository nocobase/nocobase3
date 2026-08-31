import {
  Job,
  type JobOptions,
  type NocoBaseQueueDispatchableJobClass,
} from '@nocobase/queue';

import type { ChannelManager } from './channel-manager.js';

export interface DeliveryJobPayload {
  readonly deliveryId: string;
}

export type DeliveryJobClass = NocoBaseQueueDispatchableJobClass<
  Job<DeliveryJobPayload>
>;

export function createDeliveryJob(
  channelManager: ChannelManager,
): DeliveryJobClass {
  class DeliveryJob extends Job<DeliveryJobPayload> {
    static options: JobOptions = {
      name: 'NotificationDelivery',
      queue: 'default',
    };

    async execute(): Promise<void> {
      await channelManager.send(this.payload.deliveryId);
    }
  }

  return DeliveryJob;
}
