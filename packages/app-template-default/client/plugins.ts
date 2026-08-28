import {
  defineClientPlugins,
  type AppClientPlugins,
} from '@nocobase/app-client/plugins';
import authentication from '@nocobase/app-plugin-authentication/client/plugin';
import authorization from '@nocobase/app-plugin-authorization/client/plugin';
import dataProvider from '@nocobase/app-plugin-data-provider/client/plugin';
import install from '@nocobase/app-plugin-install/client/plugin';
import notificationProvider from '@nocobase/app-plugin-notification-provider/client/plugin';
import routesExample from '@nocobase/app-plugin-routes-example/client/plugin';
import file from '@nocobase/app-plugin-file/client/plugin';
import workflow from '@nocobase/app-plugin-workflow/client/plugin';

// Array order is bootstrap order. A plugin is enabled by appearing in this
// list; removing its entry and its import disables it.
const clientPlugins: AppClientPlugins = defineClientPlugins([
  authentication(),
  authorization(),
  dataProvider(),
  install(),
  notificationProvider(),
  routesExample(),
  file(),
  workflow(),
]);

export default clientPlugins;
