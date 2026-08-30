import { useTranslation } from '@nocobase/app-i18n/client';
import type { ReactElement } from 'react';

import { WorkflowFallbackPage } from './page-shell.js';

export default function WorkflowDetailPage(): ReactElement {
  const { t } = useTranslation();

  return (
    <WorkflowFallbackPage
      description={t('pages.detail.description')}
      title={t('pages.detail.title')}
    />
  );
}
