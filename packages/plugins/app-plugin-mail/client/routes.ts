import {
  defineDevRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { Mail, Wrench } from 'lucide-react';

export const MAIL_SETTINGS_RESOURCE: string = 'mail.settings';

const routes: readonly AppClientRouteContribution[] = [
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
