import {
  defineClientPlugins,
  type AppClientPlugins,
} from '@nocobase/app-client/plugins';
import aiEmployee from '@nocobase/app-plugin-ai-employee/client';
import aiKnowledgeBase from '@nocobase/app-plugin-ai-knowledge-base/client';
import authentication from '@nocobase/app-plugin-authentication/client';
import authorization from '@nocobase/app-plugin-authorization/client';
import install from '@nocobase/app-plugin-install/client';
import notificationProvider from '@nocobase/app-plugin-notification-provider/client';
import routesExample from '@nocobase/app-plugin-routes-example/client';
import file from '@nocobase/app-plugin-file/client';
import i18n from '@nocobase/app-plugin-i18n/client';
import workflow from '@nocobase/app-plugin-workflow/client';
import notification from '@nocobase/app-plugin-notification/client';
import systemInfo from '@nocobase/app-plugin-system-info/client';

// Array order is contribution order. A plugin is enabled by appearing in this
// list; removing its entry and its import disables it.
const clientPlugins: AppClientPlugins = defineClientPlugins([
  authentication(),
  aiEmployee(),
  aiKnowledgeBase(),
  authorization(),
  i18n(),
  install(),
  notificationProvider(),
  routesExample(),
  file(),
  workflow(),
  notification(),
  systemInfo(),
]);

export default clientPlugins;
