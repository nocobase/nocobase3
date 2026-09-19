import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppLoggingConfig } from '@nocobase/app-server/logging';

const logging: AppConfigFactory<AppLoggingConfig> = defineAppConfig(
  ({ paths, env }) => ({
    level: 'info',
    file: {
      directory: paths.storage('hub/logs/app'),
      enabled: true,
      name: 'app',
      retentionDays: 7,
      maxFileSizeMB: 10,
      maxTotalSizeMB: 500,
    },
    loggers: {
      request: {
        file: {
          name: 'request',
          directory: paths.storage('hub/logs/request'),
        },
      },
    },
    console: { enabled: true, pretty: env.NODE_ENV !== 'production' },
    base: { service: 'hub' },
  }),
);
export default logging;
