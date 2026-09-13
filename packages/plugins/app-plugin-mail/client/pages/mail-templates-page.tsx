import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { MailPageHeader, MailTemplateManager } from '../components/index.js';

export default function MailTemplatesPage(): ReactElement {
  const { t } = useTranslation();

  return (
    <section className='min-h-[calc(100svh-4rem)] bg-muted/20'>
      <MailPageHeader
        description={t('templates.description', {
          defaultValue:
            'Create reusable subjects and message bodies for the composer.',
        })}
        eyebrow={t('settings.eyebrow', { defaultValue: 'Communication' })}
        title={t('templates.title', { defaultValue: 'Mail templates' })}
      />
      <div className='mx-auto w-full max-w-6xl px-6 py-6'>
        <MailTemplateManager />
      </div>
    </section>
  );
}
