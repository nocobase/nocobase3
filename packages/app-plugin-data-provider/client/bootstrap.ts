import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';
import type { AppClient } from '@nocobase/app-sdk';
import { registerAppSettingsModule } from '@nocobase/app-plugin-settings/client';

import { dataProvider } from './data-provider.js';

const bootstrap: AppClientPluginBootstrap = ({ appClient, refine }) => {
  refine.setDataProvider(dataProvider);
  registerAppDataSourceSettingsModule(appClient);
};

export function registerAppDataSourceSettingsModule(
  appClient: AppClient,
): void {
  registerAppSettingsModule(appClient, '@nocobase/app-plugin-data-provider', {
    id: 'data-sources',
    title: '数据源',
    description: '查看当前主数据库，并逐步接入外部数据源。',
    group: '数据与集成',
    status: '已接入',
    owner: '数据源模块',
    boundary:
      '页面和连接状态由数据源插件统一提供；App 只贡献自己的业务数据说明。',
    icon: 'database',
    priority: 10,
    pageLoader: () => import('./settings-page.js'),
  });
}

export default bootstrap;
