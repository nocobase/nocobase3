import authentication from '@nocobase/app-plugin-authentication/server';
import authorization from '@nocobase/app-plugin-authorization/server';
import users from '@nocobase/app-plugin-users/server';
import i18n from '@nocobase/app-plugin-i18n/server';
import install from '@nocobase/app-plugin-install/server';
import {
  defineServerPlugins,
  type AppServerPlugins,
} from '@nocobase/app-server/plugins';
import hub from '@nocobase/app-plugin-hub/server';

const serverPlugins: AppServerPlugins = defineServerPlugins([
  authentication,
  authorization,
  users,
  i18n,
  install,
  hub,
]);

export default serverPlugins;
