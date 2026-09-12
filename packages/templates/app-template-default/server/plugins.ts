import authentication from '@nocobase/app-plugin-authentication/server';
import aiEmployee from '@nocobase/app-plugin-ai-employee/server/plugin';
import authorization from '@nocobase/app-plugin-authorization/server';
import users from '@nocobase/app-plugin-users/server';
import i18n from '@nocobase/app-plugin-i18n/server';
import install from '@nocobase/app-plugin-install/server';
import notification from '@nocobase/app-plugin-notification/server';
import notificationInApp from '@nocobase/app-plugin-notification-in-app/server';
import notificationProviders from '@nocobase/app-plugin-notification-providers/server';
import workflow from '@nocobase/app-plugin-workflow/server';
import {
  defineServerPlugins,
  type AppServerPlugins,
} from '@nocobase/app-server/plugins';
import file from '@nocobase/app-plugin-file/server';

const serverPlugins: AppServerPlugins = defineServerPlugins([
  authentication,
  aiEmployee,
  authorization,
  users,
  i18n,
  install,
  notification,
  notificationInApp,
  notificationProviders,
  workflow,
  file,
]);

export default serverPlugins;
