import type { CachingConfig } from '@nocobase/caching';
import { Type } from '@sinclair/typebox';
import {
  envBoolean,
  envInteger,
  envString,
} from '@nocobase/config/providers/env';

import {
  defineAppConfig,
  defineAppConfigVariant,
  type AppConfigDefinition,
  type AppConfigVariantDefinition,
} from '../config/index.js';
import type { ResolvedAppRuntimeConfigContext } from '../runtime/index.js';

export const cachingConfig: AppConfigDefinition<
  CachingConfig,
  ResolvedAppRuntimeConfigContext
> = defineAppConfig({
  namespace: 'caching',
  schema: Type.Object({
    default: Type.String(),
    providers: Type.Record(
      Type.String(),
      Type.Object(
        {
          driver: Type.String(),
        },
        { additionalProperties: true },
      ),
    ),
  }),
  defaults: {
    default: 'memory',
    providers: {
      memory: {
        driver: 'memory',
        defaultTtl: '5m',
        maxSize: 2_000,
        useClone: true,
      },
    },
  },
  envMappings: {
    CACHING_DEFAULT: envString('default'),
    CACHING_MEMORY_DEFAULT_TTL: envString('providers.memory.defaultTtl'),
    CACHING_MEMORY_MAX_TTL: envString('providers.memory.maxTtl'),
    CACHING_MEMORY_MAX_SIZE: envInteger('providers.memory.maxSize'),
    CACHING_MEMORY_CHECK_INTERVAL: envString('providers.memory.checkInterval'),
    CACHING_MEMORY_USE_CLONE: envBoolean('providers.memory.useClone'),
  },
});

export const memoryCachingConfigVariant: AppConfigVariantDefinition =
  defineAppConfigVariant({
    target: 'caching.providers',
    discriminator: 'driver',
    value: 'memory',
    schema: Type.Object(
      {
        driver: Type.Literal('memory'),
        maxSize: Type.Optional(Type.Number({ minimum: 1 })),
        defaultTtl: Type.Optional(
          Type.Union([Type.Number({ minimum: 0 }), Type.String()]),
        ),
        maxTtl: Type.Optional(
          Type.Union([Type.Number({ minimum: 0 }), Type.String()]),
        ),
        checkInterval: Type.Optional(
          Type.Union([Type.Number({ minimum: 0 }), Type.String()]),
        ),
        useClone: Type.Optional(Type.Boolean()),
      },
      { additionalProperties: false },
    ),
  });
