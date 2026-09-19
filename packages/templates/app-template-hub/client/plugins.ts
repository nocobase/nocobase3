import defaultAccess from '@nocobase/app-plugin-authz-default-access/client';
import sharingRules from '@nocobase/app-plugin-authz-sharing-rules/client';
import restrictionRules from '@nocobase/app-plugin-authz-restriction-rules/client';
import {
  defineClientPlugins,
  type AppClientPlugins,
} from '@nocobase/app-client/plugins';
import apiKeys from '@nocobase/app-plugin-api-keys/client';
import authentication from '@nocobase/app-plugin-authentication/client';
import authorization from '@nocobase/app-plugin-authorization/client';
import users from '@nocobase/app-plugin-users/client';
import install from '@nocobase/app-plugin-install/client';
import notificationProvider from '@nocobase/app-plugin-notification-provider/client';
import i18n from '@nocobase/app-plugin-i18n/client';
import hub from '@nocobase/app-plugin-hub/client';

// Array order is contribution order. A plugin is enabled by appearing in this
// list; removing its entry and its import disables it.
const clientPlugins: AppClientPlugins = defineClientPlugins([
  authentication(),
  authorization(),
  defaultAccess(),
  sharingRules(),
  restrictionRules(),
  hub({
    applicationsPath: '/apps',
    rolesPath: '/roles',
  }),
  users({
    mount: 'app',
    path: '/users',
  }),
  apiKeys({ path: '/api-keys' }),
  i18n(),
  install(),
  notificationProvider({ demo: false }),
]);

export default clientPlugins;
