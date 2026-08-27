import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';

import { registerDefaultAppSettingsModules } from './registry.js';

const bootstrap: AppClientPluginBootstrap = ({ appClient }) => {
  registerDefaultAppSettingsModules(appClient);
};

export default bootstrap;
