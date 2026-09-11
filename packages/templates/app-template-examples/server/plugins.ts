import authentication from '@nocobase/app-plugin-authentication/server';
import aiEmployee from '@nocobase/app-plugin-ai-employee/server/plugin';
import aiKnowledgeBase from '@nocobase/app-plugin-ai-knowledge-base/server/plugin';
import authorization from '@nocobase/app-plugin-authorization/server';
import databaseExample from '@nocobase/app-plugin-database-example/server';
import i18n from '@nocobase/app-plugin-i18n/server';
import install from '@nocobase/app-plugin-install/server';
import mail from '@nocobase/app-plugin-mail/server';
import mailProviderGmail from '@nocobase/app-plugin-mail-provider-gmail/server';
import mailProviderImapSmtp from '@nocobase/app-plugin-mail-provider-imap-smtp/server';
import mailProviderMicrosoft from '@nocobase/app-plugin-mail-provider-microsoft/server';
import notification from '@nocobase/app-plugin-notification/server';
import notificationInApp from '@nocobase/app-plugin-notification-in-app/server';
import notificationProviders from '@nocobase/app-plugin-notification-providers/server';
import queueExample from '@nocobase/app-plugin-queue-example/server';
import realtimeExample from '@nocobase/app-plugin-realtime-example/server';
import routesExample from '@nocobase/app-plugin-routes-example/server';
import serviceProviderExample from '@nocobase/app-plugin-service-provider-example/server';
import workflow from '@nocobase/app-plugin-workflow/server';
import skillsExample from '@nocobase/app-plugin-skills-example/server';
import {
  defineServerPlugins,
  type AppServerPlugins,
} from '@nocobase/app-server/plugins';
import repositoryExample from '@nocobase/app-plugin-repository-example/server';
import fileRepository from '@nocobase/app-plugin-file-repository/server';
import fileRepositoryExample from '@nocobase/app-plugin-file-repository-example/server';

const serverPlugins: AppServerPlugins = defineServerPlugins([
  authentication,
  aiEmployee,
  aiKnowledgeBase,
  authorization,
  databaseExample,
  i18n,
  install,
  mail,
  mailProviderGmail,
  mailProviderImapSmtp,
  mailProviderMicrosoft,
  notification,
  notificationInApp,
  notificationProviders,
  queueExample,
  realtimeExample,
  routesExample,
  serviceProviderExample,
  workflow,
  skillsExample,
  repositoryExample,
  fileRepository,
  fileRepositoryExample,
]);

export default serverPlugins;
