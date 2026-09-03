import {
  defineDevRoutes,
  type AppClientDevRoutesContribution,
} from '@nocobase/app-client/plugins';

const routes: AppClientDevRoutesContribution = defineDevRoutes([
  {
    name: 'notification-in-app',
    path: '/notification-in-app',
    navigation: { title: 'nav.devInbox' },
    componentLoader: () => import('./dev/notification-in-app-page.js'),
  },
]);

export default routes;
