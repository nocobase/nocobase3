import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NodeServerConfig } from '@nocobase/app-server/node';

const server: AppConfigFactory<NodeServerConfig> = defineAppConfig(
  (_runtime) => ({
    host: '127.0.0.1',
    port: 13000,
    startLog: true,
  }),
);

export default server;
