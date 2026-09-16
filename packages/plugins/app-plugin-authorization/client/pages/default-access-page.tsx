import type { ReactElement } from 'react';
import { PermissionsPage } from '../components/page-shell.js';
import { useAuthorizationTranslation } from '../i18n.js';
import { DefaultAccessPanel } from './default-access-panel.js';
import {
  AuthorizationPageState,
  useAuthorizationPageData,
} from './page-support.js';

export default function DefaultAccessPage(): ReactElement {
  const t = useAuthorizationTranslation();
  const page = useAuthorizationPageData('authz/default-access/options');
  return (
    <PermissionsPage
      title={t('defaultAccess.page.title')}
      description={t('defaultAccess.page.description')}
    >
      {page.options ? (
        <DefaultAccessPanel options={page.options} />
      ) : (
        <AuthorizationPageState {...page} />
      )}
    </PermissionsPage>
  );
}
