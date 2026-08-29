import {
  SNOWFLAKE_EPOCH_SECONDS,
  type SnowflakeIdGeneratorConfig,
} from '@nocobase/id-generator';
import { Type } from '@sinclair/typebox';
import { envInteger } from '@nocobase/config/providers/env';

import { defineAppConfig, type AppConfigDefinition } from '../config/index.js';
import type { ResolvedAppRuntimeConfigContext } from '../runtime/index.js';

export const snowflakeConfig: AppConfigDefinition<
  SnowflakeIdGeneratorConfig,
  ResolvedAppRuntimeConfigContext
> = defineAppConfig<SnowflakeIdGeneratorConfig>()({
  namespace: 'snowflake',
  schema: Type.Object({
    workerId: Type.Number({ minimum: 0 }),
    epoch: Type.Optional(Type.Number()),
  }),
  defaults: { workerId: 0, epoch: SNOWFLAKE_EPOCH_SECONDS },
  envMappings: {
    SNOWFLAKE_WORKER_ID: envInteger('workerId'),
    SNOWFLAKE_EPOCH: envInteger('epoch'),
  },
});
