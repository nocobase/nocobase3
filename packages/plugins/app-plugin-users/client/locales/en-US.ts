import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  'common.close': 'Close',
  nav: { users: 'User management' },
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
    roles: 'Roles',
    systemAdministrator: 'System administrator',
    noDirectRoles: 'No direct roles',
    protectedRole: 'Protected role',
    authenticatedDefaultAccess:
      'Roles shown here are assigned directly to each user. Default access for all signed-in users applies separately and is configured in Authorization.',
    columns: { user: 'User', status: 'Status', actions: 'Actions' },
    actions: {
      menu: 'User actions',
      edit: 'Edit profile',
      resetPassword: 'Reset password',
      revokeSessions: 'Revoke sessions',
      enable: 'Enable account',
      delete: 'Delete user',
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
  deletion: {
    title: 'Delete user?',
    description:
      'Delete {{name}}? All sessions and API Keys will be revoked. Historical activity will be retained. This action cannot be undone.',
    success: 'User deleted.',
  },
  errors: {
    SELF_DELETE_NOT_ALLOWED: 'You cannot delete your own account.',
    LAST_HUB_ADMIN:
      'The last active platform administrator cannot be deleted, disabled, or assigned another role.',
    USER_HAS_APPS:
      'Transfer or delete this user’s applications before deleting the user.',
    HUB_ADMIN_REQUIRED: 'Only a platform administrator can delete users.',
    operationFailed: 'The user operation failed.',
  },
};

/**
 * English is the source of truth for this plugin's locale shape.
 */
export type UsersResource = LocaleResource<typeof enUS>;

export default enUS;
