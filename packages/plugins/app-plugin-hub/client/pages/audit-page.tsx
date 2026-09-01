import { useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { AuditLogView } from '../components/audit-log-view.js';
import {
  APPLICATION_OPTIONS,
  AUDIT_ACTIONS,
  cloneAuditFixtures,
  type AuditRecord,
} from '../domain/operations.js';

export default function AuditPage(): ReactElement {
  const { t } = useTranslation();
  const [records] = useState<AuditRecord[]>(cloneAuditFixtures);

  return (
    <AuditLogView
      records={records}
      actions={AUDIT_ACTIONS}
      applicationOptions={APPLICATION_OPTIONS}
      showFilters
      showApplication
      exportFileName='hub-audit-log.csv'
      eyebrow={t('audit.eyebrow', { defaultValue: 'Governance' })}
      title={t('audit.title', { defaultValue: 'Audit log' })}
      description={t('audit.description', {
        defaultValue:
          'Trace who changed Hub objects, which client initiated the action, and whether it succeeded.',
      })}
      variant='page'
    />
  );
}
