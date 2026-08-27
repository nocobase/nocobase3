import {
  defineClientModules,
  type AppClientModules,
} from '@nocobase/app-client/plugins';
import authentication from '@nocobase/app-plugin-authentication/client/module';
import authorization from '@nocobase/app-plugin-authorization/client/module';
import dataProvider from '@nocobase/app-plugin-data-provider/client/module';
import install from '@nocobase/app-plugin-install/client/module';
import notificationProvider from '@nocobase/app-plugin-notification-provider/client/module';
import routesExample from '@nocobase/app-plugin-routes-example/client/module';

// Array order is bootstrap order. A plugin is enabled by appearing in this
// list; removing its entry and its import disables it.
const clientModules: AppClientModules = defineClientModules([
  authentication(),
  authorization(),
  dataProvider(),
  install(),
  notificationProvider(),
  routesExample(),
]);

export default clientModules;
