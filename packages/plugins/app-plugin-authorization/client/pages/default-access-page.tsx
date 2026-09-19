import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { DefaultAccessPanel } from './default-access-panel.js';
import {
  AuthorizationSettingsPage,
  useAuthorizationPageData,
} from './page-support.js';

export default function DefaultAccessPage(): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-authorization');

  const { options, error } = useAuthorizationPageData(
    'authz/default-access/options',
  );
  return (
    <AuthorizationSettingsPage
      eyebrow={t('recordAccess', { defaultValue: 'Record access' })}
      title={t('defaultAccess', { defaultValue: 'Default Access' })}
      description={t('defaultAccessDescription', {
        defaultValue:
          'Set the baseline record scope before sharing and restriction rules are evaluated.',
      })}
      error={error}
      loading={!options}
    >
      {options ? <DefaultAccessPanel options={options} /> : null}
    </AuthorizationSettingsPage>
  );
}
