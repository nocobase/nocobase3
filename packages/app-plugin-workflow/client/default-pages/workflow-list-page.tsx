import { useTranslation } from '@nocobase/app-i18n/client';
import type { ReactElement } from 'react';

import { WorkflowFallbackPage } from './page-shell.js';

export default function WorkflowListPage(): ReactElement {
  // A page rendered under its own route inherits this plugin's namespace from the host, so no namespace is named.
  const { t } = useTranslation();

  return (
    <WorkflowFallbackPage
      description={t('pages.list.description')}
      title={t('pages.list.title')}
    />
  );
}
