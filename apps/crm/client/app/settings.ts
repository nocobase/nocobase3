import { registerAppAccessControlSettingsModules } from '@nocobase/app-plugin-access-control/client';
import {
  configureAppDataSourceSettings,
  registerAppDataSourceSettingsModule,
} from '@nocobase/app-plugin-data-provider/client';
import {
  configureAppSettings,
  registerDefaultAppSettingsModules,
} from '@nocobase/app-plugin-settings/client';
import type { AppClient } from '@nocobase/app-sdk';

export function configureCrmSettings(appClient: AppClient): void {
  configureAppSettings(appClient, {
    appName: 'CRM',
    returnPath: '/dashboard',
  });
  registerDefaultAppSettingsModules(appClient);
  registerAppAccessControlSettingsModules(appClient);
  registerAppDataSourceSettingsModule(appClient);
  configureAppDataSourceSettings(appClient, {
    description: '查看 CRM 当前使用的数据连接、运行状态和承载的业务数据。',
    collections: [
      {
        name: 'agent_crm_accounts',
        title: '客户档案',
        description: '客户分层、行业和合作状态',
        route: '/accounts',
      },
      {
        name: 'agent_crm_contacts',
        title: '联系人',
        description: '关键联系人和决策角色',
        route: '/contacts',
      },
      {
        name: 'agent_crm_leads',
        title: '销售线索',
        description: '线索来源、评分和跟进状态',
        route: '/leads',
      },
      {
        name: 'agent_crm_opportunities',
        title: '商机管道',
        description: '商机阶段、金额和成交计划',
        route: '/opportunities',
      },
      {
        name: 'agent_crm_activities',
        title: '跟进任务',
        description: '电话、会议和后续行动',
        route: '/activities',
      },
    ],
  });
}
