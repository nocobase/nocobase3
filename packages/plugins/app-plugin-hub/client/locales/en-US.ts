import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  navigation: {
    applications: 'Applications',
    userAccess: 'Users & permissions',
    roles: 'Roles & permissions',
  },
  roles: {
    eyebrow: 'Users & permissions',
    title: 'Roles & permissions',
    description: 'Review what each fixed Hub role can do.',
    loading: 'Loading roles…',
    loadFailed: 'Roles could not be loaded.',
    retry: 'Try again',
    capability: 'Capability',
    allowed: 'Allowed',
    notAllowed: 'Not allowed',
    note: 'Hub roles are fixed. Assign a role from User management.',
    names: {
      'hub-administrator': 'Administrator',
      'hub-operator': 'Operator',
      'hub-viewer': 'Viewer',
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
