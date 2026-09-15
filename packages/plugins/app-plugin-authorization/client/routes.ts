import {
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import {
  KeyRound,
  Layers,
  LockKeyhole,
  Share2,
  ShieldBan,
  ShieldCheck,
} from 'lucide-react';

// The group id and the child ids compose into the paths these pages were already published at, so every URL is
// unchanged: /settings/authorization/permission-sets and its three siblings.
const settings: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'authorization',
    path: '/authorization',
    navigation: { title: 'Authorization', icon: ShieldCheck },
    children: [
      {
        name: 'overview',
        path: '/overview',
        navigation: { title: 'Overview', icon: Layers },
        // A route declares one resource, and there is no "any of these" form. The overview explains the four layers
        // and links to them, so it follows the permission sets page: whoever may read that may read this.
        access: {
          resource: 'authorization.settings.permission-sets',
          action: 'read',
        },
        componentLoader: () => import('./pages/overview-page.js'),
      },
      {
        name: 'permission-sets',
        path: '/permission-sets',
        navigation: { title: 'Permission Sets', icon: KeyRound },
        access: {
          resource: 'authorization.settings.permission-sets',
          action: 'read',
        },
        componentLoader: () => import('./pages/permission-sets-page.js'),
      },
      {
        name: 'default-access',
        path: '/default-access',
        navigation: { title: 'Default Access', icon: LockKeyhole },
        access: {
          resource: 'authorization.settings.default-access',
          action: 'read',
        },
        componentLoader: () => import('./pages/default-access-page.js'),
      },
      {
        name: 'sharing-rules',
        path: '/sharing-rules',
        navigation: { title: 'Sharing Rules', icon: Share2 },
        access: {
          resource: 'authorization.settings.sharing-rules',
          action: 'read',
        },
        componentLoader: () => import('./pages/sharing-rules-page.js'),
      },
      {
        name: 'restriction-rules',
        path: '/restriction-rules',
        navigation: { title: 'Restriction Rules', icon: ShieldBan },
        access: {
          resource: 'authorization.settings.restriction-rules',
          action: 'read',
        },
        componentLoader: () => import('./pages/restriction-rules-page.js'),
      },
    ],
  },
]);

export default settings;
