import {
  defineAppRoutes,
  defineDevRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import {
  FileText,
  History,
  Inbox,
  Link2,
  Mail,
  Send,
  Table2,
  Users,
} from 'lucide-react';

const routes: readonly AppClientRouteContribution[] = [
  defineAppRoutes([
    {
      name: 'mail',
      path: '/mail',
      auth: 'required',
      access: { resource: 'mail.settings', action: 'access' },
      componentLoader: () => import('./pages/mail-workspace-page.js'),
    },
  ]),
  defineSettingsRoutes([
    {
      name: 'mail',
      path: '/mail',
      navigation: { title: 'nav.settings', icon: Mail },
      children: [
        {
          name: 'my-accounts',
          path: '/my-accounts',
          navigation: { title: 'nav.myAccounts', icon: Link2 },
          access: { resource: 'mail.settings', action: 'access' },
          componentLoader: () => import('./pages/mail-accounts-dev-page.js'),
        },
        {
          name: 'templates',
          path: '/templates',
          navigation: { title: 'nav.templates', icon: FileText },
          access: { resource: 'mail.settings', action: 'access' },
          componentLoader: () => import('./pages/mail-templates-page.js'),
        },
        {
          name: 'accounts',
          path: '/accounts',
          navigation: { title: 'nav.accounts', icon: Users },
          access: { resource: 'mail.settings', action: 'access' },
          componentLoader: () => import('./pages/mail-settings-page.js'),
        },
        {
          name: 'operation-logs',
          path: '/send-logs',
          navigation: { title: 'nav.operationLogs', icon: History },
          access: { resource: 'mail.settings', action: 'access' },
          componentLoader: () => import('./pages/mail-operation-logs-page.js'),
        },
      ],
    },
  ]),
  defineDevRoutes([
    {
      name: 'mail',
      path: '/mail',
      navigation: { title: 'nav.dev', icon: Mail },
      children: [
        {
          name: 'accounts',
          path: '/accounts',
          navigation: { title: 'nav.devAccounts', icon: Link2 },
          access: { resource: 'mail.settings', action: 'access' },
          componentLoader: () => import('./pages/mail-accounts-dev-page.js'),
        },
        {
          name: 'center',
          path: '/center',
          navigation: { title: 'nav.devCenter', icon: Inbox },
          access: { resource: 'mail.settings', action: 'access' },
          componentLoader: () =>
            import('./pages/mail-dev-page.js').then(
              ({ MailCenterDevPage }) => ({
                default: MailCenterDevPage,
              }),
            ),
        },
        {
          name: 'management',
          path: '/management',
          navigation: { title: 'nav.devManagement', icon: Table2 },
          access: { resource: 'mail.settings', action: 'access' },
          componentLoader: () => import('./pages/mail-management-page.js'),
        },
        {
          name: 'send',
          path: '/send',
          navigation: { title: 'nav.devSend', icon: Send },
          access: { resource: 'mail.settings', action: 'access' },
          componentLoader: () =>
            import('./pages/mail-dev-page.js').then(({ MailSendDevPage }) => ({
              default: MailSendDevPage,
            })),
        },
        {
          name: 'sync-logs',
          path: '/sync-logs',
          navigation: { title: 'nav.syncLogs', icon: History },
          access: { resource: 'mail.settings', action: 'access' },
          componentLoader: () => import('./pages/mail-sync-logs-page.js'),
        },
        {
          name: 'send-logs',
          path: '/send-logs',
          navigation: { title: 'nav.sendLogs', icon: Send },
          access: { resource: 'mail.settings', action: 'access' },
          componentLoader: () => import('./pages/mail-send-logs-page.js'),
        },
      ],
    },
  ]),
];

export default routes;
