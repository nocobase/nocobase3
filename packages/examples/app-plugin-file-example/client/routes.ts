import { FolderOpen } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
const routes: readonly AppClientRouteContribution[] = [
  defineAppRoutes([
    {
      name: 'file-repository',
      navigation: { title: 'navGroup', icon: FolderOpen },
      breadcrumb: { title: 'navGroup' },
      children: [
        {
          name: 'file-repository-attachments',
          path: '/file-repository',
          auth: 'required',
          navigation: { title: 'navAttachments' },
          breadcrumb: { title: 'navAttachments' },
          authz: {
            resource: { type: 'page', id: 'file-repository-attachments' },
            action: 'access',
          },
          componentLoader: () => import('./pages/attachments.js'),
        },
        {
          name: 'file-repository-profile-avatars',
          path: '/file-repository/profile-avatars',
          auth: 'required',
          navigation: { title: 'navProfiles' },
          breadcrumb: { title: 'navProfiles' },
          authz: {
            resource: { type: 'page', id: 'file-repository-profile-avatars' },
            action: 'access',
          },
          componentLoader: () => import('./pages/profile-avatars.js'),
        },
        {
          name: 'file-repository-order-attachments',
          path: '/file-repository/order-attachments',
          auth: 'required',
          navigation: { title: 'navOrders' },
          breadcrumb: { title: 'navOrders' },
          authz: {
            resource: { type: 'page', id: 'file-repository-order-attachments' },
            action: 'access',
          },
          componentLoader: () => import('./pages/order-attachments.js'),
        },
      ],
    },
  ]),
];
export default routes;
