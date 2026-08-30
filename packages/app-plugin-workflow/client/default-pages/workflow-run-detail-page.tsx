import { useTranslation } from '@nocobase/app-i18n/client';
import type { ReactElement } from 'react';

import { WorkflowFallbackPage } from './page-shell.js';

export default function WorkflowRunDetailPage(): ReactElement {
  const { t } = useTranslation();

  return (
    <WorkflowFallbackPage
      description={t('pages.runDetail.description')}
      title={t('pages.runDetail.title')}
    />
  );
}
