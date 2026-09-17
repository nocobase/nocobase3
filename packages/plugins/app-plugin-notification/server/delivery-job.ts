import type { ChannelManager } from './channel-manager.js';

export const NOTIFICATION_QUEUE_NAME = 'notification';
export const NOTIFICATION_DELIVERY_CHANNEL = 'NotificationDelivery';

export interface DeliveryJobPayload {
  readonly deliveryId: string;
}

export type DeliveryHandler = (
  channel: string,
  payload: DeliveryJobPayload,
) => Promise<void>;

/** Captures only this application's delivery manager, never a global job locator. */
export function createDeliveryHandler(
  channelManager: Pick<ChannelManager, 'send'>,
): DeliveryHandler {
  return async (channel, payload): Promise<void> => {
    if (channel !== NOTIFICATION_DELIVERY_CHANNEL) return;
    await channelManager.send(payload.deliveryId);
  };
}
