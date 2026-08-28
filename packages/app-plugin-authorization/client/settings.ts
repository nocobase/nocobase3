import {
  defineClientSettings,
  type AppClientSettingDefinition,
} from '@nocobase/app-client/plugins';

// The ids keep the `authorization/` prefix the paths already had, so every page stays at the URL it was published at.
const settings: readonly AppClientSettingDefinition[] = defineClientSettings([
  {
    id: 'authorization/permission-sets',
    title: 'Permission Sets',
    group: 'Authorization',
    access: {
      resource: 'authorization.settings.permission-sets',
      action: 'read',
    },
    pageLoader: () => import('./pages/permission-sets-page.js'),
  },
  {
    id: 'authorization/default-access',
    title: 'Default Access',
    group: 'Authorization',
    access: {
      resource: 'authorization.settings.default-access',
      action: 'read',
    },
    pageLoader: () => import('./pages/default-access-page.js'),
  },
  {
    id: 'authorization/sharing-rules',
    title: 'Sharing Rules',
    group: 'Authorization',
    access: {
      resource: 'authorization.settings.sharing-rules',
      action: 'read',
    },
    pageLoader: () => import('./pages/sharing-rules-page.js'),
  },
  {
    id: 'authorization/restriction-rules',
    title: 'Restriction Rules',
    group: 'Authorization',
    access: {
      resource: 'authorization.settings.restriction-rules',
      action: 'read',
    },
    pageLoader: () => import('./pages/restriction-rules-page.js'),
  },
]);

export default settings;
