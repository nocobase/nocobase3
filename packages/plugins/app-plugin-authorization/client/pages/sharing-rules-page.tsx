import type { ReactElement } from 'react';
import { PermissionsPage } from '../components/page-shell.js';
import { useAuthorizationTranslation } from '../i18n.js';
import { SharingRulesPanel } from './sharing-rules-panel.js';
import {
  AuthorizationPageState,
  useAuthorizationPageData,
  useUserDirectory,
} from './page-support.js';

export default function SharingRulesPage(): ReactElement {
  const t = useAuthorizationTranslation();
  const page = useAuthorizationPageData('authz/sharing-rules/options');
  const users = useUserDirectory();
  return (
    <PermissionsPage
      title={t('sharingRules.page.title')}
      description={t('sharingRules.page.description')}
    >
      {page.options ? (
        <SharingRulesPanel options={page.options} directory={users} />
      ) : (
        <AuthorizationPageState {...page} />
      )}
    </PermissionsPage>
  );
}
