import { useTranslation } from '@nocobase/app-i18n/client';
import type { ReactElement } from 'react';

import { WorkflowFallbackPage } from './page-shell.js';

export default function WorkflowRunListPage(): ReactElement {
  const { t } = useTranslation();

  return (
    <WorkflowFallbackPage
      description={t('pages.runList.description')}
      title={t('pages.runList.title')}
    />
  );
}
