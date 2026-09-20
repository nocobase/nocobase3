import { ClipboardList } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
const routes: readonly AppClientRouteContribution[] = [
  defineAppRoutes([
    {
      name: 'audit-example',
      path: '/audit-example',
      auth: 'required',
      authz: {
        resource: { type: 'audit-example.customer', id: '*' },
        action: 'list',
      },
      navigation: { title: 'title', icon: ClipboardList },
      breadcrumb: { title: 'title' },
      componentLoader: () => import('./pages/customers.js'),
    },
  ]),
];
export default routes;
