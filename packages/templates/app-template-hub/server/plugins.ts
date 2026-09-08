import authentication from '@nocobase/app-plugin-authentication/server';
import authorization from '@nocobase/app-plugin-authorization/server';
import users from '@nocobase/app-plugin-users/server';
import databaseExample from '@nocobase/app-plugin-database-example/server';
import i18n from '@nocobase/app-plugin-i18n/server';
import install from '@nocobase/app-plugin-install/server';
import notification from '@nocobase/app-plugin-notification/server';
import notificationInApp from '@nocobase/app-plugin-notification-in-app/server';
import notificationProviders from '@nocobase/app-plugin-notification-providers/server';
import queueExample from '@nocobase/app-plugin-queue-example/server';
import realtimeExample from '@nocobase/app-plugin-realtime-example/server';
import routesExample from '@nocobase/app-plugin-routes-example/server';
import serviceProviderExample from '@nocobase/app-plugin-service-provider-example/server';
import workflow from '@nocobase/app-plugin-workflow/server';
import {
  defineServerPlugins,
  type AppServerPlugins,
} from '@nocobase/app-server/plugins';
import skillsExample from '@nocobase/app-plugin-skills-example/server';
import hub from '@nocobase/app-plugin-hub/server';

const serverPlugins: AppServerPlugins = defineServerPlugins([
  authentication,
  authorization,
  users,
  databaseExample,
  i18n,
  install,
  notification,
  notificationInApp,
  notificationProviders,
  queueExample,
  realtimeExample,
  routesExample,
  serviceProviderExample,
  workflow,
  skillsExample,
  hub,
]);

export default serverPlugins;
