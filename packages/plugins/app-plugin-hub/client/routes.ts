import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
} from '@nocobase/app-client/plugins';

import { Boxes } from 'lucide-react';

const routes: AppClientAppRoutesContribution = defineAppRoutes([
  {
    name: 'hub',
    path: '/hub',
    auth: 'required',
    navigation: { title: 'navigation.applications', icon: Boxes },
    componentLoader: () => import('./pages/hub-page.js'),
  },
]);

export default routes;
