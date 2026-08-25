import type { ReactElement } from 'react';
import { PermissionSetsPanel } from './permission-sets-panel.js';
import {
  AuthorizationSettingsPage,
  useAuthorizationPageData,
} from './page-support.js';

export default function PermissionSetsPage(): ReactElement {
  const { options, users, error } = useAuthorizationPageData(
    'authz/permission-sets/options',
    'authz/permission-sets/users',
  );
  return (
    <AuthorizationSettingsPage
      eyebrow='Authorization'
      title='Permission Sets'
      description='Create reusable permission bundles and assign them to users.'
      error={error}
      loading={!options}
    >
      {options ? <PermissionSetsPanel options={options} users={users} /> : null}
    </AuthorizationSettingsPage>
  );
}
