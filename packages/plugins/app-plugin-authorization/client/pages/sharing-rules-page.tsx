import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { SharingRulesPanel } from './sharing-rules-panel.js';
import {
  AuthorizationSettingsPage,
  useAuthorizationPageData,
} from './page-support.js';

export default function SharingRulesPage(): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-authorization');

  const { options, users, error } = useAuthorizationPageData(
    'authz/sharing-rules/options',
    'authz/sharing-rules/users',
  );
  return (
    <AuthorizationSettingsPage
      eyebrow={t('Record access', { defaultValue: 'Record access' })}
      title={t('Sharing Rules', { defaultValue: 'Sharing Rules' })}
      description={t(
        'Grant selected users access to specific records or a reusable record scope.',
        {
          defaultValue:
            'Grant selected users access to specific records or a reusable record scope.',
        },
      )}
      error={error}
      loading={!options}
    >
      {options ? <SharingRulesPanel options={options} users={users} /> : null}
    </AuthorizationSettingsPage>
  );
}
