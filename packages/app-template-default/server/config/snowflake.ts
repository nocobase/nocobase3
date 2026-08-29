import {
  defineConfig,
  type ConfigFactory,
} from '@nocobase/app-server-kit/config';
import {
  SNOWFLAKE_EPOCH_SECONDS,
  type SnowflakeIdGeneratorConfig,
} from '@nocobase/id-generator';

const snowflakeConfig: ConfigFactory<SnowflakeIdGeneratorConfig> = defineConfig(
  ({ env }): SnowflakeIdGeneratorConfig => ({
    workerId: env.number('SNOWFLAKE_WORKER_ID', 0),
    epoch: env.number('SNOWFLAKE_EPOCH', SNOWFLAKE_EPOCH_SECONDS),
  }),
);

export default snowflakeConfig;
