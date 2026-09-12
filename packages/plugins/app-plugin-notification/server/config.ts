import {
  defineAppConfig,
  type AppConfigDefinition,
} from '@nocobase/app-server/config';
import { Type } from '@sinclair/typebox';

import type { NotificationConfig } from './types.js';

export const notificationConfig: AppConfigDefinition<NotificationConfig> =
  defineAppConfig({
    namespace: 'notification',
    schema: Type.Object({
      channels: Type.Array(
        Type.Object({
          type: Type.String(),
          enabled: Type.Boolean(),
          providers: Type.Array(
            Type.Object(
              {
                type: Type.String(),
                name: Type.String(),
                enabled: Type.Optional(Type.Boolean()),
              },
              { additionalProperties: true },
            ),
          ),
        }),
      ),
      // Accepted for backward-compatible configuration parsing. Test sending is
      // now controlled only by the notification:test send permission.
      test: Type.Optional(
        Type.Object({
          enabled: Type.Boolean(),
        }),
      ),
    }),
    defaults: { channels: [] },
  });
