import type { AppAccessControlDefinition } from '@nocobase/app-plugin-access-control/server';

const allCapabilities = ['read', 'create', 'update', 'destroy'] as const;
const operateCapabilities = ['read', 'create', 'update'] as const;
const readCapabilities = ['read'] as const;

export const ordersAccessControlDefinition: AppAccessControlDefinition = {
  appKey: 'orders',
  appName: '订单运营中心',
  adminRoleKey: 'orders-admin',
  roles: [
    {
      key: 'orders-admin',
      title: '管理员',
      description: '管理 App 成员和权限，并访问全部订单业务数据。',
      system: true,
      permissions: [
        { resource: 'orders', capabilities: allCapabilities },
        { resource: 'customers', capabilities: allCapabilities },
        { resource: 'products', capabilities: allCapabilities },
      ],
    },
    {
      key: 'orders-operator',
      title: '订单运营',
      description: '处理订单、客户和商品资料，不管理成员与权限。',
      permissions: [
        { resource: 'orders', capabilities: operateCapabilities },
        { resource: 'customers', capabilities: operateCapabilities },
        { resource: 'products', capabilities: operateCapabilities },
      ],
    },
    {
      key: 'orders-viewer',
      title: '只读成员',
      description: '查看订单运营数据，不执行新增、修改和删除操作。',
      permissions: [
        { resource: 'orders', capabilities: readCapabilities },
        { resource: 'customers', capabilities: readCapabilities },
        { resource: 'products', capabilities: readCapabilities },
      ],
    },
  ],
  resources: [
    { name: 'orders', title: '订单' },
    { name: 'customers', title: '客户档案' },
    { name: 'products', title: '商品档案' },
  ],
};
