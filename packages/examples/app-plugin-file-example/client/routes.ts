import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
const routes: readonly AppClientRouteContribution[] = [
  defineAppRoutes([
    {
      name: 'file-repository',
      navigation: { title: 'navGroup' },
      children: [
        {
          name: 'file-repository-attachments',
          path: '/file-repository',
          auth: 'required',
          navigation: { title: 'navAttachments' },
          componentLoader: () => import('./pages/attachments.js'),
        },
        {
          name: 'file-repository-profile-avatars',
          path: '/file-repository/profile-avatars',
          auth: 'required',
          navigation: { title: 'navProfiles' },
          componentLoader: () => import('./pages/profile-avatars.js'),
        },
        {
          name: 'file-repository-order-attachments',
          path: '/file-repository/order-attachments',
          auth: 'required',
          navigation: { title: 'navOrders' },
          componentLoader: () => import('./pages/order-attachments.js'),
        },
      ],
    },
  ]),
];
export default routes;
