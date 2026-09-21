import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import type { NotificationTestSendRequest } from './types.js';

const notificationTestSendRequestSchema = Type.Object(
  {
    channel: Type.String({ minLength: 1 }),
    values: Type.Record(Type.String(), Type.String()),
  },
  { additionalProperties: false },
);

export function isNotificationTestSendRequest(
  value: unknown,
): value is NotificationTestSendRequest {
  return Value.Check(notificationTestSendRequestSchema, value);
}
