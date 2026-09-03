import {
  defineDevRoutes,
  type AppClientDevRoutesContribution,
} from '@nocobase/app-client/plugins';
import { Bell } from 'lucide-react';

const routes: AppClientDevRoutesContribution = defineDevRoutes([
  {
    name: 'notification-in-app',
    path: '/notification-in-app',
    navigation: { title: 'nav.devInbox', icon: Bell },
    componentLoader: () => import('./dev/notification-in-app-page.js'),
  },
]);

export default routes;
