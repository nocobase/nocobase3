import type { ReactElement } from 'react';
import { DefaultAccessPanel } from './default-access-panel.js';
import {
  AuthorizationSettingsPage,
  useAuthorizationPageData,
} from './page-support.js';

export default function DefaultAccessPage(): ReactElement {
  const { options, error } = useAuthorizationPageData(
    'authz/default-access/options',
  );
  return (
    <AuthorizationSettingsPage
      eyebrow='Record access'
      title='Default Access'
      description='Set the baseline record scope before sharing and restriction rules are evaluated.'
      error={error}
      loading={!options}
    >
      {options ? <DefaultAccessPanel options={options} /> : null}
    </AuthorizationSettingsPage>
  );
}
