import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';

import { configureNotificationClient } from './runtime.js';

const bootstrap: AppClientPluginBootstrap = ({ appClient }) => {
  configureNotificationClient(appClient);
};

export default bootstrap;
