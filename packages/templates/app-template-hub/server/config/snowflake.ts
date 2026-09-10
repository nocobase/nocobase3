import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { SnowflakeIdGeneratorConfig } from '@nocobase/snowflake';
import { SNOWFLAKE_EPOCH_SECONDS } from '@nocobase/snowflake';

const snowflake: AppConfigFactory<SnowflakeIdGeneratorConfig> = defineAppConfig(
  (_runtime) => ({ workerId: 0, epoch: SNOWFLAKE_EPOCH_SECONDS }),
);

export default snowflake;
