import authentication from '@nocobase/app-plugin-authentication/server/plugin';
import aiEmployee from '@nocobase/app-plugin-ai-employee/server/plugin';
import aiKnowledgeBase from '@nocobase/app-plugin-ai-knowledge-base/server/plugin';
import authorization from '@nocobase/app-plugin-authorization/server/plugin';
import databaseExample from '@nocobase/app-plugin-database-example/server/plugin';
import file from '@nocobase/app-plugin-file/server/plugin';
import i18n from '@nocobase/app-plugin-i18n/server/plugin';
import install from '@nocobase/app-plugin-install/server/plugin';
import notification from '@nocobase/app-plugin-notification/server/plugin';
import notificationInApp from '@nocobase/app-plugin-notification-in-app/server/plugin';
import notificationProviders from '@nocobase/app-plugin-notification-providers/server/plugin';
import queueExample from '@nocobase/app-plugin-queue-example/server/plugin';
import realtimeExample from '@nocobase/app-plugin-realtime-example/server/plugin';
import routesExample from '@nocobase/app-plugin-routes-example/server/plugin';
import serviceProviderExample from '@nocobase/app-plugin-service-provider-example/server/plugin';
import workflow from '@nocobase/app-plugin-workflow/server/plugin';
import systemInfo from '@nocobase/app-plugin-system-info/server';
import skillsExample from '@nocobase/app-plugin-skills-example/server';
import {
  defineServerPlugins,
  type AppServerPlugins,
} from '@nocobase/app-server-kit/plugins';

import type { AppConfig } from './config/index.js';

const serverPlugins: AppServerPlugins<AppConfig> =
  defineServerPlugins<AppConfig>([
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
