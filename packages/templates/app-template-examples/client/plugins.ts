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
import notificationInApp from '@nocobase/app-plugin-notification-in-app/client';
import routesExample from '@nocobase/app-plugin-routes-example/client';
import i18n from '@nocobase/app-plugin-i18n/client';
import workflow from '@nocobase/app-plugin-workflow/client';
import notification from '@nocobase/app-plugin-notification/client';
import repositoryExample from '@nocobase/app-plugin-repository-example/client';
import fileRepository from '@nocobase/app-plugin-file-repository/client';
import fileRepositoryExample from '@nocobase/app-plugin-file-repository-example/client';

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
  notificationInApp(),
  routesExample(),
  workflow(),
  notification(),
  repositoryExample(),
  fileRepository(),
  fileRepositoryExample(),
]);

export default clientPlugins;
