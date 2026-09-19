import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { CalendarClock } from 'lucide-react';

export const SCHEDULER_ACCESS_RESOURCE: string = 'scheduler.schedules';

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'automation',
    path: '/automation',
    extend: true,
    navigation: { title: 'nav.automation', icon: CalendarClock },
    children: [
      {
        name: 'schedules',
        path: '/schedules',
        navigation: { title: 'nav.schedules', icon: CalendarClock },
        access: { resource: SCHEDULER_ACCESS_RESOURCE, action: 'access' },
        componentLoader: () => import('./pages/schedules-page.js'),
      },
    ],
  },
]);

const detailRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'schedule-detail',
    path: '/settings/automation/schedules/:scheduleId',
    access: { resource: SCHEDULER_ACCESS_RESOURCE, action: 'access' },
    componentLoader: () => import('./pages/schedule-detail-page.js'),
  },
]);

const routes: readonly AppClientRouteContribution[] = [
  settingsRoutes,
  detailRoutes,
];

export default routes;
