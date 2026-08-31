import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import './locales/index.js';
import routes from './routes.js';
export interface AIEmployeeClientOptions {
  readonly placeholder?: never;
}

const aiEmployee: AppClientPluginFactory<AIEmployeeClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-ai-employee',
    routes,
  });

export default aiEmployee;
