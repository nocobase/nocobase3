import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';

import type { __NOCOBASE_SYMBOL_NAME__ClientOptions } from './plugin.js';

const bootstrap: AppClientPluginBootstrap<
  __NOCOBASE_SYMBOL_NAME__ClientOptions
> = ({ refine, options }) => {
  refine.addResources([
    {
      name: __NOCOBASE_SHORT_NAME_LITERAL__,
      list: __NOCOBASE_ROUTE_PATH_LITERAL__,
      meta: {
        label: options.resourceLabel ?? __NOCOBASE_DISPLAY_NAME_LITERAL__,
      },
    },
  ]);
};

export default bootstrap;
