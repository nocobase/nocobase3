import type { ReactElement } from 'react';
import { PermissionsPage } from '../components/page-shell.js';
import { SharingRulesPanel } from './sharing-rules-panel.js';
import {
  AuthorizationPageState,
  useAuthorizationPageData,
  useUserDirectory,
} from './page-support.js';

export default function SharingRulesPage(): ReactElement {
  const page = useAuthorizationPageData('authz/sharing-rules/options');
  const users = useUserDirectory();
  return (
    <PermissionsPage
      title='Sharing Rules'
      description='Sharing rules widen access, opening specific records or a reusable record scope to the people you choose.'
    >
      {page.options ? (
        <SharingRulesPanel options={page.options} directory={users} />
      ) : (
        <AuthorizationPageState {...page} />
      )}
    </PermissionsPage>
  );
}
