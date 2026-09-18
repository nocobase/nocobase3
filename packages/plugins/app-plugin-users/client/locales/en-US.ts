import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  nav: { users: 'User management' },
  assignment: {
    inspect: 'Check effective permissions',
    keepEditing: 'Keep editing',
    discardChanges: 'Discard changes',
    showMore: 'Show more',
    title: 'Permission assignments',
    description:
      'Manage permissions assigned directly to this user. Changes apply when saved.',
    search: 'Search names or descriptions',
    selectedOnly: 'Selected only',
    selected: '{{count}} selected',
    changes: '{{added}} added, {{removed}} removed',
    noChanges: 'No changes',
    empty: 'No matching options',
    protected: 'This assignment is protected and cannot be changed here',
    failed: 'Could not save. Please try again.',
    discard: 'Discard unsaved changes?',
  },
  page: {
    title: 'Users',
    description:
      'Manage accounts, permission assignments, and active sessions.',
    add: 'Add user',
    search: 'Search name, username, or email',
    allStatuses: 'All statuses',
    allRoles: 'All permission sets',
    enabled: 'Enabled',
    disabled: 'Disabled',
    noUsers: 'No users found.',
    total: '{{count}} users',
    previous: 'Previous',
    next: 'Next',
    selectRole: 'Select permission set',
    roles: 'Permission sets',
    systemAdministrator: 'System administrator',
    noDirectRoles: 'Not directly assigned',
    protectedRole: 'Protected assignment',
    authenticatedDefaultAccess:
      'Only direct assignments are shown here. Permissions received through all signed-in users, teams, or other subjects are not listed.',
    columns: { user: 'User', status: 'Status', actions: 'Actions' },
    actions: {
      menu: 'User actions',
      edit: 'Edit profile',
      resetPassword: 'Reset password',
      revokeSessions: 'Revoke sessions',
      enable: 'Enable account',
      disable: 'Disable account',
    },
  },
  form: {
    addTitle: 'Add user',
    editTitle: 'Edit user',
    addDescription: 'Create an account and assign permissions.',
    editDescription: 'Update the account profile.',
    name: 'Name',
    username: 'Username',
    email: 'Email',
    password: 'Password',
    cancel: 'Cancel',
    save: 'Save',
    create: 'Create user',
  },
  password: {
    title: 'Reset password',
    description:
      'Set a new password for {{name}}. All sessions will be revoked.',
    newPassword: 'New password',
    submit: 'Reset password',
  },
  state: {
    enableTitle: 'Enable account?',
    disableTitle: 'Disable account?',
    enableDescription: '{{name}} will be able to sign in again.',
    disableDescription:
      '{{name}} will be signed out from every device immediately.',
    enable: 'Enable',
    disable: 'Disable',
  },
  errors: { operationFailed: 'The user operation failed.' },
};

/**
 * English is the source of truth for this plugin's locale shape.
 */
export type UsersResource = LocaleResource<typeof enUS>;

export default enUS;
