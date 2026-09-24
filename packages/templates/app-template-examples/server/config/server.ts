import {
  defineAppConfig,
  envBoolean,
  envInteger,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { NodeServerConfig } from '@nocobase/app-server/node';

const server: AppConfigFactory<NodeServerConfig> = defineAppConfig({
  defaults: { host: '127.0.0.1', port: 13000, startLog: true },
  env: {
    APP_SERVER_HOST: envString('host'),
    APP_SERVER_PORT: envInteger('port'),
    // `pnpm dev` sets it to false: it prints its own ready banner and public URL.
    APP_SERVER_START_LOG: envBoolean('startLog'),
  },
});

export default server;
