import type { ReactElement } from 'react';
import { RestrictionRulesPanel } from './restriction-rules-panel.js';
import {
  AuthorizationSettingsPage,
  useAuthorizationPageData,
  useUserDirectory,
} from './page-support.js';

export default function RestrictionRulesPage(): ReactElement {
  const { options, error } = useAuthorizationPageData(
    'authz/restriction-rules/options',
  );
  const users = useUserDirectory();
  return (
    <AuthorizationSettingsPage
      eyebrow='Record access'
      title='Restriction Rules'
      description='Narrow the records available to selected users without granting access by itself.'
      error={error}
      loading={!options}
    >
      {options ? (
        <RestrictionRulesPanel options={options} directory={users} />
      ) : null}
    </AuthorizationSettingsPage>
  );
}
