import {
  defineAppConfig,
  envInteger,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { SnowflakeIdGeneratorConfig } from '@nocobase/snowflake';
import { SNOWFLAKE_EPOCH_SECONDS } from '@nocobase/snowflake';

const snowflake: AppConfigFactory<SnowflakeIdGeneratorConfig> = defineAppConfig(
  {
    defaults: { workerId: 0, epoch: SNOWFLAKE_EPOCH_SECONDS },
    env: { SNOWFLAKE_WORKER_ID: envInteger('workerId') },
  },
);

export default snowflake;
