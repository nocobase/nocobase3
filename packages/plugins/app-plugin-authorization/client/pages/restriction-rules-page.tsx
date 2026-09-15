import type { ReactElement } from 'react';
import { PermissionsPage } from '../components/page-shell.js';
import { RestrictionRulesPanel } from './restriction-rules-panel.js';
import {
  AuthorizationPageState,
  useAuthorizationPageData,
  useUserDirectory,
} from './page-support.js';

export default function RestrictionRulesPage(): ReactElement {
  const page = useAuthorizationPageData('authz/restriction-rules/options');
  const users = useUserDirectory();
  return (
    <PermissionsPage
      title='Restriction Rules'
      description='Restriction rules narrow access, limiting the records selected users reach without granting anything by themselves.'
    >
      {page.options ? (
        <RestrictionRulesPanel options={page.options} directory={users} />
      ) : (
        <AuthorizationPageState {...page} />
      )}
    </PermissionsPage>
  );
}
