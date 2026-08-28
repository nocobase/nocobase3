import {
  defineClientSettings,
  type AppClientSettingDefinition,
} from '@nocobase/app-client/plugins';
import {
  KeyRound,
  LockKeyhole,
  Share2,
  ShieldBan,
  ShieldCheck,
} from 'lucide-react';

// The group id and the child ids compose into the paths these pages were already published at, so every URL is
// unchanged: /settings/authorization/permission-sets and its three siblings.
const settings: readonly AppClientSettingDefinition[] = defineClientSettings([
  {
    id: 'authorization',
    title: 'Authorization',
    icon: ShieldCheck,
    children: [
      {
        id: 'permission-sets',
        title: 'Permission Sets',
        icon: KeyRound,
        access: {
          resource: 'authorization.settings.permission-sets',
          action: 'read',
        },
        pageLoader: () => import('./pages/permission-sets-page.js'),
      },
      {
        id: 'default-access',
        title: 'Default Access',
        icon: LockKeyhole,
        access: {
          resource: 'authorization.settings.default-access',
          action: 'read',
        },
        pageLoader: () => import('./pages/default-access-page.js'),
      },
      {
        id: 'sharing-rules',
        title: 'Sharing Rules',
        icon: Share2,
        access: {
          resource: 'authorization.settings.sharing-rules',
          action: 'read',
        },
        pageLoader: () => import('./pages/sharing-rules-page.js'),
      },
      {
        id: 'restriction-rules',
        title: 'Restriction Rules',
        icon: ShieldBan,
        access: {
          resource: 'authorization.settings.restriction-rules',
          action: 'read',
        },
        pageLoader: () => import('./pages/restriction-rules-page.js'),
      },
    ],
  },
]);

export default settings;
