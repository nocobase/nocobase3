import { Type } from '@sinclair/typebox';
import {
  envBoolean,
  envInteger,
  envString,
  type EnvironmentMapping,
} from '@nocobase/config/providers/env';

import { defineAppConfig, type AppConfigDefinition } from '../config/index.js';
import type { ResolvedAppRuntimeConfigContext } from '../runtime/definition.js';

export interface NodeServerConfig {
  readonly host: string;
  readonly port: number;
  readonly startLog: boolean;
  readonly viteDevUrl?: string | null;
  readonly nodeEnv?: string;
}

export const nodeServerConfig: AppConfigDefinition<
  NodeServerConfig,
  ResolvedAppRuntimeConfigContext
> = defineAppConfig({
  namespace: 'server',
  schema: Type.Object(
    {
      host: Type.String(),
      port: Type.Number({ minimum: 0, maximum: 65535 }),
      startLog: Type.Boolean(),
      viteDevUrl: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      nodeEnv: Type.Optional(Type.String()),
    },
    { additionalProperties: false },
  ),
  defaults: { host: '127.0.0.1', port: 13000, startLog: true },
  envMappings: {
    APP_SERVER_HOST: envString('host'),
    APP_SERVER_PORT: envInteger('port'),
    APP_SERVER_START_LOG: envBoolean('startLog'),
    APP_VITE_DEV_URL: viteDevUrlEnvironment('viteDevUrl'),
    NODE_ENV: envString('nodeEnv'),
  },
});

function viteDevUrlEnvironment(path: string): EnvironmentMapping {
  return {
    path,
    parse: (value): string | null =>
      value === 'false' || value === '0' ? null : value,
  };
}
