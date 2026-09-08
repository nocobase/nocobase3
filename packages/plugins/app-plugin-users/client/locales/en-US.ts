import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  nav: { users: 'Users' },
  page: {
    title: 'Users',
    description: 'Create accounts, assign roles, and control active sessions.',
    add: 'Add user',
    search: 'Search name, username, or email',
    allStatuses: 'All statuses',
    allRoles: 'All roles',
    enabled: 'Enabled',
    disabled: 'Disabled',
    noUsers: 'No users found.',
    total: '{{count}} users',
    previous: 'Previous',
    next: 'Next',
    selectRole: 'Select role',
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
    addDescription: 'Create an account and assign its application role.',
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
