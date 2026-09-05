import {
  defineAppRoutes,
  defineDevRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { Mail, Wrench } from 'lucide-react';

export const MAIL_SETTINGS_RESOURCE: string = 'mail.settings';
export const MAIL_WORKSPACE_RESOURCE: string = 'mail';

const routes: readonly AppClientRouteContribution[] = [
  defineAppRoutes([
    {
      name: 'mail',
      path: '/mail',
      auth: 'required',
      access: { resource: MAIL_WORKSPACE_RESOURCE, action: 'access' },
      componentLoader: () => import('./pages/mail-workspace-page.js'),
    },
  ]),
  defineSettingsRoutes([
    {
      name: 'mail',
      path: '/mail',
      navigation: { title: 'nav.settings', icon: Mail },
      access: { resource: MAIL_SETTINGS_RESOURCE, action: 'access' },
      componentLoader: () => import('./pages/mail-settings-page.js'),
    },
  ]),
  defineDevRoutes([
    {
      name: 'mail',
      path: '/mail',
      navigation: { title: 'nav.dev', icon: Wrench },
      componentLoader: () => import('./pages/mail-dev-page.js'),
    },
  ]),
];

export default routes;
