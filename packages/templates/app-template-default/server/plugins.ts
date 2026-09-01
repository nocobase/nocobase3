import authentication from '@nocobase/app-plugin-authentication/server';
import aiEmployee from '@nocobase/app-plugin-ai-employee/server/plugin';
import aiKnowledgeBase from '@nocobase/app-plugin-ai-knowledge-base/server/plugin';
import authorization from '@nocobase/app-plugin-authorization/server';
import databaseExample from '@nocobase/app-plugin-database-example/server';
import file from '@nocobase/app-plugin-file/server';
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
import systemInfo from '@nocobase/app-plugin-system-info/server';
import skillsExample from '@nocobase/app-plugin-skills-example/server';
import {
  defineServerPlugins,
  type AppServerPlugins,
} from '@nocobase/app-server/plugins';

const serverPlugins: AppServerPlugins = defineServerPlugins([
  authentication,
  aiEmployee,
  aiKnowledgeBase,
  authorization,
  databaseExample,
  file,
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
  systemInfo,
  skillsExample,
]);

export default serverPlugins;
