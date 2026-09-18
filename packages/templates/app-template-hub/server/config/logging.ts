import { hubStoragePath } from '../storage.js';
import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppLoggingConfig } from '@nocobase/app-server/logging';

const logging: AppConfigFactory<AppLoggingConfig> = defineAppConfig(
  (runtime) => ({
    level: 'info',
    file: {
      directory: hubStoragePath(runtime, 'hub/logs/app', 'logs'),
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
          directory: hubStoragePath(runtime, 'hub/logs/request', 'logs'),
        },
      },
    },
    console: { enabled: true, pretty: runtime.env.NODE_ENV !== 'production' },
    base: { service: 'hub' },
  }),
);
export default logging;
