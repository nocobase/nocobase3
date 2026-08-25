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
    title: { text: '订单运营中心' },
  });
  refine.addResources([
    { name: 'dashboard', list: '/dashboard', meta: { label: '订单总览' } },
    { name: 'orders', list: '/orders', meta: { label: '订单管理' } },
    { name: 'customers', list: '/customers', meta: { label: '客户档案' } },
    { name: 'products', list: '/products', meta: { label: '商品档案' } },
  ]);
  configureAppSettings(appClient, {
    appName: '订单运营中心',
    returnPath: '/dashboard',
  });
  registerAppDataSourceSettingsModule(appClient);
  configureAppDataSourceSettings(appClient, {
    description: '查看订单 App 当前使用的数据连接、运行状态和承载的业务数据。',
    collections: [
      {
        name: 'app_orders_customers',
        title: '客户',
        description: '订单关联的客户信息',
        route: '/customers',
      },
      {
        name: 'app_orders_products',
        title: '商品',
        description: '可销售的商品和服务',
        route: '/products',
      },
      {
        name: 'app_orders_orders',
        title: '订单',
        description: '订单状态、金额和履约信息',
        route: '/orders',
      },
      {
        name: 'app_orders_order_lines',
        title: '订单明细',
        description: '订单中的商品和数量',
        route: '/orders',
      },
    ],
  });
};

export default bootstrap;
