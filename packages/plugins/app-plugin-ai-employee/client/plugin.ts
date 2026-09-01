import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import routes from './routes.js';
export interface AIEmployeeClientOptions {
  readonly placeholder?: never;
}

const aiEmployee: AppClientPluginFactory<AIEmployeeClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-ai-employee',
    locales,
    routes,
  });

export default aiEmployee;
