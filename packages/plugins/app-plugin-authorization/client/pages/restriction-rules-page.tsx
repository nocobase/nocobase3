import type { ReactElement } from 'react';
import { PermissionsPage } from '../components/page-shell.js';
import { useAuthorizationTranslation } from '../i18n.js';
import { RestrictionRulesPanel } from './restriction-rules-panel.js';
import {
  AuthorizationPageState,
  useAuthorizationPageData,
} from './page-support.js';

export default function RestrictionRulesPage(): ReactElement {
  const t = useAuthorizationTranslation();
  const page = useAuthorizationPageData('authz/restriction-rules/options');
  return (
    <PermissionsPage
      title={t('restrictionRules.page.title')}
      description={t('restrictionRules.page.description')}
    >
      {page.options ? (
        <RestrictionRulesPanel options={page.options} />
      ) : (
        <AuthorizationPageState {...page} />
      )}
    </PermissionsPage>
  );
}
