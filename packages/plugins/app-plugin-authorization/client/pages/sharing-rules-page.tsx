import type { ReactElement } from 'react';
import { SharingRulesPanel } from './sharing-rules-panel.js';
import {
  AuthorizationSettingsPage,
  useAuthorizationPageData,
  useUserDirectory,
} from './page-support.js';

export default function SharingRulesPage(): ReactElement {
  const { options, error } = useAuthorizationPageData(
    'authz/sharing-rules/options',
  );
  const users = useUserDirectory();
  return (
    <AuthorizationSettingsPage
      eyebrow='Record access'
      title='Sharing Rules'
      description='Grant selected users access to specific records or a reusable record scope.'
      error={error}
      loading={!options}
    >
      {options ? (
        <SharingRulesPanel options={options} directory={users} />
      ) : null}
    </AuthorizationSettingsPage>
  );
}
