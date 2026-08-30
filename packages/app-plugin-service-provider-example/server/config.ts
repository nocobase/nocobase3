import {
  defineAppConfig,
  type AppConfigDefinition,
} from '@nocobase/app-server-kit/config';
import { Type } from '@sinclair/typebox';

export interface HeartbeatConfig {
  readonly enabled: boolean;
}

export const heartbeatConfig: AppConfigDefinition<HeartbeatConfig> =
  defineAppConfig({
    namespace: 'heartbeat',
    schema: Type.Object(
      {
        enabled: Type.Boolean({
          default: true,
          description: 'Starts the example heartbeat service.',
        }),
      },
      { additionalProperties: false },
    ),
    defaults: {
      enabled: true,
    },
  });
