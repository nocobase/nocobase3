import {
  defineAppRoutes,
  type AppClientAppRoutesContribution,
} from '@nocobase/app-client/plugins';
import type { NotificationProviderClientOptions } from './plugin.js';

const demoRoutes: AppClientAppRoutesContribution = defineAppRoutes([
  {
    name: 'demo',
    path: '/notification-provider',
    componentLoader: () => import('./pages/notification-demo-page.js'),
  },
]);

export default function routes(
  options: NotificationProviderClientOptions,
): AppClientAppRoutesContribution | readonly AppClientAppRoutesContribution[] {
  return options.enableDemoRoute ? demoRoutes : [];
}
