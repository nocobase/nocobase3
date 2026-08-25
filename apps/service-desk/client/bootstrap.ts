import type { AppClientBootstrap } from '@nocobase/app-client/plugins';
import {
  configureAppDataSourceSettings,
  registerAppDataSourceSettingsModule,
} from '@nocobase/app-plugin-data-provider/client';
import { configureAppSettings } from '@nocobase/app-plugin-settings/client';

const bootstrap: AppClientBootstrap = ({ appClient, refine }) => {
  refine.setOptions({
    disableTelemetry: true,
    syncWithLocation: true,
    title: { text: '客户服务中心' },
  });
  refine.addResources([
    { name: 'dashboard', list: '/dashboard', meta: { label: '服务总览' } },
    { name: 'tickets', list: '/tickets', meta: { label: '工单管理' } },
    { name: 'customers', list: '/customers', meta: { label: '客户联系人' } },
    { name: 'catalog', list: '/catalog', meta: { label: '服务目录' } },
    { name: 'team', list: '/team', meta: { label: '客服团队' } },
  ]);
  configureAppSettings(appClient, {
    appName: '客户服务中心',
    returnPath: '/dashboard',
  });
  registerAppDataSourceSettingsModule(appClient);
  configureAppDataSourceSettings(appClient, {
    description:
      '查看服务台 App 当前使用的数据连接、运行状态和承载的业务数据。',
    collections: [
      {
        name: 'app_service_desk_customers',
        title: '客户联系人',
        description: '工单关联的客户和联系人',
        route: '/customers',
      },
      {
        name: 'app_service_desk_services',
        title: '服务目录',
        description: '可受理的服务和支持范围',
        route: '/catalog',
      },
      {
        name: 'app_service_desk_agents',
        title: '客服团队',
        description: '客服成员、团队和负责范围',
        route: '/team',
      },
      {
        name: 'app_service_desk_tickets',
        title: '工单',
        description: '客户问题、状态和处理记录',
        route: '/tickets',
      },
      {
        name: 'app_service_desk_activities',
        title: '活动记录',
        description: '工单处理过程中的沟通和操作记录',
        route: '/tickets',
      },
    ],
  });
};

export default bootstrap;
