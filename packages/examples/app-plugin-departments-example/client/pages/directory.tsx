import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { PageContainer } from '../components/page-container.js';
import { PageHeader } from '../components/page-header.js';
import { Button } from '../components/ui/button.js';

interface DirectoryEntry {
  readonly id: string;
  readonly title: string;
  readonly parentId: string | null;
}

/** The departments the caller's permissions reach, read through the directory's `view` action. */
export default function DirectoryPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{
    readonly key: number;
    readonly entries?: readonly DirectoryEntry[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = reloadCount;
    api
      .request<{ data: DirectoryEntry[] }>({
        path: 'departments-example/directory',
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, entries: data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== reloadCount;
  const error = loading ? undefined : result?.error;
  const entries = result?.entries;

  const titles = new Map(entries?.map((entry) => [entry.id, entry.title]));

  return (
    <PageContainer>
      <PageHeader
        title={t('directory.title')}
        description={t('directory.description')}
      />
      {error instanceof ApiClientError && error.status === 403 ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('directory.forbidden')}
        </p>
      ) : error ? (
        <div role='alert' className='flex items-center gap-2 text-sm'>
          <span className='text-destructive'>{t('directory.failed')}</span>
          <Button
            size='sm'
            variant='outline'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('directory.retry')}
          </Button>
        </div>
      ) : !entries ? null : entries.length ? (
        <ul className='divide-y divide-border rounded-lg border border-border'>
          {entries.map((entry) => (
            <li key={entry.id} className='px-3 py-2'>
              <p className='text-sm'>{entry.title}</p>
              {entry.parentId && titles.has(entry.parentId) ? (
                <p className='text-xs text-muted-foreground'>
                  {titles.get(entry.parentId)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-sm text-muted-foreground'>{t('directory.empty')}</p>
      )}
    </PageContainer>
  );
}
