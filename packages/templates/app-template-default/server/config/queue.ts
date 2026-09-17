import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppQueueServiceConfig } from '@nocobase/app-server/queue';

const queue: AppConfigFactory<AppQueueServiceConfig> = defineAppConfig(
  (runtime) => ({
    queueBackend: 'inMemory',
    environment: runtime.env.NODE_ENV,
  }),
);

export default queue;
