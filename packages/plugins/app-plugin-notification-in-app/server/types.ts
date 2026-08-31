export interface InAppMessage {
  readonly title?: string;
  readonly body: string;
  readonly actionUrl?: string;
}

export interface InAppRecipient {
  readonly userId: string;
}

export interface InAppItem {
  readonly id: string;
  readonly deliveryId: string;
  readonly notificationId: string;
  readonly userId: string;
  readonly title?: string;
  readonly body: string;
  readonly actionUrl?: string;
  readonly readAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
