import {
  defineDevRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { History, Inbox, Link2, Mail, Send, Table2, Users } from 'lucide-react';

const routes: readonly AppClientRouteContribution[] = [
  defineSettingsRoutes([
    {
      name: 'mail',
      path: '/mail',
      navigation: { title: 'nav.settings', icon: Mail },
      children: [
        {
          name: 'accounts',
          path: '/accounts',
          navigation: { title: 'nav.accounts', icon: Users },
          access: { resource: 'mail.admin', action: 'access' },
          componentLoader: () => import('./pages/mail-settings-page.js'),
        },
        {
          name: 'operation-logs',
          path: '/operation-logs',
          navigation: { title: 'nav.operationLogs', icon: History },
          access: { resource: 'mail.admin', action: 'access' },
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
          access: { resource: 'mail.workspace', action: 'access' },
          componentLoader: () => import('./pages/mail-accounts-dev-page.js'),
        },
        {
          name: 'center',
          path: '/center',
          navigation: { title: 'nav.devCenter', icon: Inbox },
          access: { resource: 'mail.workspace', action: 'access' },
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
          access: { resource: 'mail.management', action: 'access' },
          componentLoader: () => import('./pages/mail-management-page.js'),
        },
        {
          name: 'send',
          path: '/send',
          navigation: { title: 'nav.devSend', icon: Send },
          access: { resource: 'mail.workspace', action: 'access' },
          componentLoader: () =>
            import('./pages/mail-dev-hub-page.js').then(
              ({ MailSendHubPage }) => ({ default: MailSendHubPage }),
            ),
          children: [
            {
              name: 'compose',
              path: 'compose',
              componentLoader: () =>
                import('./pages/mail-dev-hub-page.js').then(
                  ({ MailComposeRedirect }) => ({
                    default: MailComposeRedirect,
                  }),
                ),
            },
            {
              name: 'bulk',
              path: 'bulk',
              componentLoader: () =>
                import('./pages/mail-dev-hub-page.js').then(
                  ({ MailComposeRedirect }) => ({
                    default: MailComposeRedirect,
                  }),
                ),
            },
          ],
        },
        {
          name: 'logs',
          path: '/logs',
          navigation: { title: 'nav.devLogs', icon: History },
          access: { resource: 'mail.workspace', action: 'access' },
          componentLoader: () =>
            import('./pages/mail-dev-hub-page.js').then(
              ({ MailLogsHubPage }) => ({ default: MailLogsHubPage }),
            ),
          children: [
            {
              name: 'send',
              path: 'send',
              componentLoader: () => import('./pages/mail-send-logs-page.js'),
            },
            {
              name: 'bulk',
              path: 'bulk',
              componentLoader: () =>
                import('./pages/mail-dev-hub-page.js').then(
                  ({ MailBulkLogsPage }) => ({ default: MailBulkLogsPage }),
                ),
            },
            {
              name: 'sync',
              path: 'sync',
              componentLoader: () => import('./pages/mail-sync-logs-page.js'),
            },
          ],
        },
        {
          name: 'bulk-send',
          path: '/bulk-send',
          access: { resource: 'mail.workspace', action: 'access' },
          componentLoader: () =>
            import('./pages/mail-dev-hub-page.js').then(
              ({ MailBulkSendRedirect }) => ({ default: MailBulkSendRedirect }),
            ),
        },
        {
          name: 'sync-logs',
          path: '/sync-logs',
          access: { resource: 'mail.workspace', action: 'access' },
          componentLoader: () =>
            import('./pages/mail-dev-hub-page.js').then(
              ({ MailSyncLogsRedirect }) => ({ default: MailSyncLogsRedirect }),
            ),
        },
        {
          name: 'send-logs',
          path: '/send-logs',
          access: { resource: 'mail.workspace', action: 'access' },
          componentLoader: () =>
            import('./pages/mail-dev-hub-page.js').then(
              ({ MailSendLogsRedirect }) => ({ default: MailSendLogsRedirect }),
            ),
        },
      ],
    },
  ]),
];

export default routes;
