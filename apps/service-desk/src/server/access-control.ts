import type { AppAccessControlDefinition } from '@nocobase/app-plugin-access-control/server';

const allCapabilities = ['read', 'create', 'update', 'destroy'] as const;
const operateCapabilities = ['read', 'create', 'update'] as const;
const readCapabilities = ['read'] as const;

export const serviceDeskAccessControlDefinition: AppAccessControlDefinition = {
  appKey: 'service-desk',
  appName: '客户服务中心',
  adminRoleKey: 'service-desk-admin',
  roles: [
    {
      key: 'service-desk-admin',
      title: '管理员',
      description: '管理 App 成员和权限，并访问全部服务台数据。',
      system: true,
      permissions: [
        { resource: 'tickets', capabilities: allCapabilities },
        { resource: 'customers', capabilities: allCapabilities },
        { resource: 'services', capabilities: allCapabilities },
        { resource: 'agents', capabilities: allCapabilities },
      ],
    },
    {
      key: 'service-desk-lead',
      title: '客服主管',
      description: '处理工单、客户、服务目录和团队信息，不管理 App 权限。',
      permissions: [
        { resource: 'tickets', capabilities: operateCapabilities },
        { resource: 'customers', capabilities: operateCapabilities },
        { resource: 'services', capabilities: operateCapabilities },
        { resource: 'agents', capabilities: operateCapabilities },
      ],
    },
    {
      key: 'service-desk-agent',
      title: '客服人员',
      description: '处理客户工单，并查看服务目录、客户与团队信息。',
      permissions: [
        { resource: 'tickets', capabilities: operateCapabilities },
        { resource: 'customers', capabilities: readCapabilities },
        { resource: 'services', capabilities: readCapabilities },
        { resource: 'agents', capabilities: readCapabilities },
      ],
    },
  ],
  resources: [
    { name: 'tickets', title: '客户工单' },
    { name: 'customers', title: '客户联系人' },
    { name: 'services', title: '服务目录' },
    { name: 'agents', title: '客服团队' },
  ],
};
