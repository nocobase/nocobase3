import type { LoggingConfig } from '@nocobase/logging';
import { Type } from '@sinclair/typebox';

import {
  defineAppConfig,
  envBoolean,
  envString,
  envStrings,
  type AppConfigDefinition,
} from '../config/index.js';

const defaultRedactPaths = [
  'password',
  'password_confirmation',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'authorization',
  'Authorization',
  'cookie',
  'Cookie',
  'headers.authorization',
  'headers.Authorization',
  'headers.cookie',
  'headers.Cookie',
];
export interface AppLoggingConfig extends LoggingConfig {
  readonly pretty?: boolean;
  readonly nodeEnv?: string;
}

export const loggingConfig: AppConfigDefinition<AppLoggingConfig> =
  defineAppConfig<AppLoggingConfig>()({
    namespace: 'logging',
    schema: Type.Object(
      {
        default: Type.Optional(Type.String()),
        name: Type.Optional(Type.String()),
        level: Type.Optional(
          Type.Union([
            Type.Literal('fatal'),
            Type.Literal('error'),
            Type.Literal('warn'),
            Type.Literal('info'),
            Type.Literal('debug'),
            Type.Literal('trace'),
            Type.Literal('silent'),
          ]),
        ),
        redact: Type.Optional(
          Type.Union([Type.Literal(false), Type.Array(Type.String())]),
        ),
        base: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
        transport: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
        loggers: Type.Optional(
          Type.Record(
            Type.String(),
            Type.Record(Type.String(), Type.Unknown()),
          ),
        ),
        pretty: Type.Optional(Type.Boolean()),
        nodeEnv: Type.Optional(Type.String()),
      },
      { additionalProperties: true },
    ),
    defaults: {
      default: 'system',
      name: 'app',
      level: 'info',
      base: { service: 'app' },
      redact: defaultRedactPaths,
    },
    envMappings: {
      LOG_DEFAULT: envString('default'),
      LOG_NAME: envString('name'),
      LOG_LEVEL: envString('level'),
      LOG_SERVICE: envString('base.service'),
      LOG_REDACT: envStrings('redact'),
      LOG_PRETTY: envBoolean('pretty'),
      NODE_ENV: envString('nodeEnv'),
    },
  });
