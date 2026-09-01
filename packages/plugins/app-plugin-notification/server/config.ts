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
      test: Type.Optional(
        Type.Object({
          enabled: Type.Boolean(),
          emailRecipient: Type.Optional(Type.String()),
        }),
      ),
    }),
    defaults: { channels: [] },
  });
