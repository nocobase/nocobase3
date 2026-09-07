import { useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import type { AuditEventsQuery } from '../contracts.js';
import { AuditEventsView } from '../components/index.js';

export default function AuditEventsPage(): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-audit');
  const [query, setQuery] = useState<AuditEventsQuery>({
    store: 'main',
    pageSize: 25,
  });
  return (
    <main className='min-w-0 space-y-6 p-4 text-foreground sm:p-6'>
      <header>
        <h1 className='text-2xl font-semibold'>{t('events.title')}</h1>
        <p className='mt-2 text-muted-foreground'>{t('events.description')}</p>
      </header>
      <form
        className='flex flex-wrap items-end gap-3'
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setQuery({
            store: (form.get('store') as string).trim(),
            pageSize: 25,
          });
        }}
      >
        <label className='grid gap-1 text-sm'>
          {t('events.store')}
          <input
            name='store'
            required
            defaultValue='main'
            className='rounded-md border border-input bg-background px-3 py-2'
          />
        </label>
        <button
          className='rounded-md bg-primary px-4 py-2 text-primary-foreground'
          type='submit'
        >
          {t('events.apply')}
        </button>
      </form>
      <p className='text-sm text-muted-foreground'>{t('events.scope')}</p>
      <AuditEventsView query={query} />
    </main>
  );
}
