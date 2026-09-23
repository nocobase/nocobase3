import { ClipboardList } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const routes: readonly AppClientRouteContribution[] = [
  defineAppRoutes([
    {
      name: 'notificationExample',
      navigation: { title: 'navigation.tasks', icon: ClipboardList },
      breadcrumb: { title: 'navigation.tasks' },
      children: [
        {
          name: 'notificationExampleTasks',
          path: '/notification-example',
          auth: 'required',
          authz: 'skip',
          navigation: { title: 'navigation.taskManagement' },
          breadcrumb: { title: 'navigation.taskManagement' },
          componentLoader: () => import('./pages/tasks.js'),
        },
        {
          name: 'notificationExampleTaskDetail',
          path: '/notification-example/tasks/:taskId',
          auth: 'required',
          authz: 'skip',
          breadcrumb: { title: 'navigation.taskDetail' },
          componentLoader: () => import('./pages/task-detail.js'),
        },
      ],
    },
  ]),
];

export default routes;
