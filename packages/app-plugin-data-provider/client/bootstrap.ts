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
    description: '为 App 页面提供统一的数据读取、写入和数据源路由能力。',
    group: '数据与集成',
    status: '已接入',
    owner: 'Data Provider',
    boundary:
      '当前模块只负责前端数据请求适配；不提供连接配置、数据建模或数据源管理。',
    icon: 'database',
    priority: 10,
    pageLoader: () => import('./settings-page.js'),
  });
}

export default bootstrap;
