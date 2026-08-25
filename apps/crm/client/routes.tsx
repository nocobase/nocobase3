import { defineAppRoutes } from '@nocobase/portal-sdk/routing';
import {
  Activity,
  Building2,
  ContactRound,
  Gauge,
  Target,
  UsersRound,
} from 'lucide-react';

// Set this to false when the application no longer needs the example routes
// contributed by installed Registry extensions. Providers, adapters, and the
// development showcase under /dev remain available.
export const registryRoutesEnabled = false;

// Add application-owned business routes here. Installed Registry extensions
// contribute their own route definitions through the same runtime. Add a
// resource entry when a route should also appear in navigation.
const resourceRoutes = (
  name: string,
  path: string,
  label: string,
  singularLabel: string,
  description: string,
  icon: React.ReactNode,
  priority: number,
) => ({
  name,
  path,
  lazy: () => import('./features/crm/resource-list'),
  resource: {
    meta: {
      label,
      singularLabel,
      description,
      icon,
      priority,
      canCreate: true,
      canDelete: true,
      acl: { type: 'collection' as const },
    },
  },
  children: [
    {
      name: `${name}.create`,
      path: 'create',
      resourceAction: 'create' as const,
      lazy: () => import('./features/crm/record-create'),
    },
    {
      name: `${name}.edit`,
      path: 'edit/:id',
      resourceAction: 'edit' as const,
      lazy: () => import('./features/crm/record-edit'),
    },
    {
      name: `${name}.show`,
      path: 'show/:id',
      resourceAction: 'show' as const,
      lazy: () => import('./features/crm/record-show'),
      children: [
        {
          name: `${name}.show.edit`,
          path: 'edit',
          lazy: () =>
            import('./features/crm/record-edit').then((module) => ({
              default: module.RecordShowEditRoute,
            })),
        },
      ],
    },
  ],
});

export const appRoutes = defineAppRoutes([
  {
    name: 'crm.dashboard',
    path: '/dashboard',
    lazy: () => import('./features/crm/dashboard'),
    resource: {
      meta: {
        label: '销售总览',
        singularLabel: '销售总览',
        description: '聚焦今天需要推进的客户、商机与跟进任务。',
        icon: <Gauge />,
        priority: 1,
        acl: { type: 'authenticated' },
      },
    },
  },
  resourceRoutes(
    'agent_crm_leads',
    '/leads',
    '销售线索',
    '销售线索',
    '集中处理新线索、资格判断和下一步动作。',
    <UsersRound />,
    10,
  ),
  resourceRoutes(
    'agent_crm_opportunities',
    '/opportunities',
    '商机管道',
    '商机',
    '跟踪阶段、金额、赢率和预计成交日期。',
    <Target />,
    20,
  ),
  resourceRoutes(
    'agent_crm_accounts',
    '/accounts',
    '客户档案',
    '客户',
    '维护客户画像、分层和合作状态。',
    <Building2 />,
    30,
  ),
  resourceRoutes(
    'agent_crm_contacts',
    '/contacts',
    '联系人',
    '联系人',
    '记录关键联系人、决策角色和沟通方式。',
    <ContactRound />,
    40,
  ),
  resourceRoutes(
    'agent_crm_activities',
    '/activities',
    '跟进任务',
    '跟进任务',
    '安排电话、会议、邮件与后续行动。',
    <Activity />,
    50,
  ),
]);

export const standaloneAppRoutes = defineAppRoutes([
  {
    name: 'app-settings',
    path: '/settings',
    lazy: () =>
      import('@nocobase/app-plugin-settings/client/pages/settings-center'),
    access: { roles: { anyOf: ['crm-admin'] } },
  },
  {
    name: 'app-settings.module',
    path: '/settings/:moduleId',
    lazy: () =>
      import('@nocobase/app-plugin-settings/client/pages/settings-module'),
    access: { roles: { anyOf: ['crm-admin'] } },
  },
]);
