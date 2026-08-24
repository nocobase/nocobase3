import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';

import { createNotificationProvider } from './notification-provider.js';

const bootstrap: AppClientPluginBootstrap = ({ refine }) => {
  refine.setNotificationProvider(createNotificationProvider());
};

export default bootstrap;
