import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppQueueServiceConfig } from '@nocobase/app-server/queue';

const queue: AppConfigFactory<AppQueueServiceConfig> = defineAppConfig(() => ({
  queueBackend: 'inMemory',
}));

export default queue;
