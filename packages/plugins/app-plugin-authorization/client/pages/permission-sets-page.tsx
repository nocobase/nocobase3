import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { PermissionSetsPanel } from './permission-sets-panel.js';
import {
  AuthorizationSettingsPage,
  useAuthorizationPageData,
} from './page-support.js';

export default function PermissionSetsPage(): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-authorization');

  const { options, users, error } = useAuthorizationPageData(
    'authz/permission-sets/options',
    'authz/permission-sets/users',
  );
  return (
    <AuthorizationSettingsPage
      eyebrow={t('authorization', { defaultValue: 'Authorization' })}
      title={t('permissionSets', { defaultValue: 'Permission Sets' })}
      description={t('permissionSetsDescription', {
        defaultValue:
          'Create reusable permission bundles and assign them to users.',
      })}
      error={error}
      loading={!options}
    >
      {options ? <PermissionSetsPanel options={options} users={users} /> : null}
    </AuthorizationSettingsPage>
  );
}
