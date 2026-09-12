import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  navigation: {
    applications: 'Applications',
    userAccess: 'Users & permissions',
    roles: 'Roles & permissions',
  },
  roles: {
    title: 'Roles & permissions',
    description: 'Compare the access included with each Hub role.',
    loading: 'Loading roles…',
    loadFailed: 'Roles could not be loaded.',
    retry: 'Try again',
    capability: 'Capability',
    allowed: 'Allowed',
    notAllowed: 'Not allowed',
    names: {
      'hub-administrator': 'Administrator',
      'hub-operator': 'Operator',
      'hub-viewer': 'Viewer',
    },
    descriptions: {
      'hub-administrator': 'Full access to applications and user management',
      'hub-operator': 'Create, configure, deploy, and operate applications',
      'hub-viewer': 'View application and runtime status only',
    },
    groups: {
      visibility: 'Applications and status',
      operations: 'Deployment and operations',
      'user-management': 'User management',
    },
    capabilities: {
      'view-status': 'View application, release, deployment, and host status',
      'view-resources': 'View Resources and raw configuration',
      'create-release': 'Create applications and upload releases',
      operate: 'Deploy, rollback, start, stop, and restart applications',
      configure: 'Change application settings and configuration',
      remove: 'Delete applications',
      'manage-users': 'Manage users and assign roles',
    },
  },
};

/**
 * English is the source of truth for this plugin's locale shape.
 */
export type HubResource = LocaleResource<typeof enUS>;

export default enUS;
