import type { ReactElement } from 'react';
import { PermissionsPage } from '../components/page-shell.js';
import { DefaultAccessPanel } from './default-access-panel.js';
import {
  AuthorizationPageState,
  useAuthorizationPageData,
} from './page-support.js';

export default function DefaultAccessPage(): ReactElement {
  const page = useAuthorizationPageData('authz/default-access/options');
  return (
    <PermissionsPage
      title='Default Access'
      description='Default access widens what everyone reaches on a collection, setting the baseline record scope before sharing and restriction rules are evaluated.'
    >
      {page.options ? (
        <DefaultAccessPanel options={page.options} />
      ) : (
        <AuthorizationPageState {...page} />
      )}
    </PermissionsPage>
  );
}
