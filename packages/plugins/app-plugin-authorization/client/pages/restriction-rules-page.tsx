import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { RestrictionRulesPanel } from './restriction-rules-panel.js';
import {
  AuthorizationSettingsPage,
  useAuthorizationPageData,
} from './page-support.js';

export default function RestrictionRulesPage(): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-authorization');

  const { options, users, error } = useAuthorizationPageData(
    'authz/restriction-rules/options',
    'authz/restriction-rules/users',
  );
  return (
    <AuthorizationSettingsPage
      eyebrow={t('recordAccess', { defaultValue: 'Record access' })}
      title={t('restrictionRules', { defaultValue: 'Restriction Rules' })}
      description={t('restrictionRulesDescription', {
        defaultValue:
          'Narrow the records available to selected users without granting access by itself.',
      })}
      error={error}
      loading={!options}
    >
      {options ? (
        <RestrictionRulesPanel options={options} users={users} />
      ) : null}
    </AuthorizationSettingsPage>
  );
}
