import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { HeartbeatConfig } from '@nocobase/app-plugin-service-provider-example/server';

const heartbeat: AppConfigFactory<HeartbeatConfig> = defineAppConfig(
  (_runtime) => ({
    enabled: true,
  }),
);

export default heartbeat;
