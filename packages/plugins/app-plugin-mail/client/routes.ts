import {
  defineDevRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { Wrench } from 'lucide-react';

const routes: readonly AppClientRouteContribution[] = [
  defineDevRoutes([
    {
      name: 'mail',
      path: '/mail',
      navigation: { title: 'nav.dev', icon: Wrench },
      access: { resource: 'mail.settings', action: 'access' },
      componentLoader: () => import('./pages/mail-dev-page.js'),
    },
  ]),
];

export default routes;
