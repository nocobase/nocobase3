import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';

import { dataProvider } from './data-provider.js';

const bootstrap: AppClientPluginBootstrap = ({ refine }) => {
  refine.setDataProvider(dataProvider);
};

export default bootstrap;
