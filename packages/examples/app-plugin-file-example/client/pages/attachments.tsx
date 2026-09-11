import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '@nocobase/app-plugin-file/client';

import { FileList } from '../components/file-list.js';
import { FileUploadField } from '../components/file-upload-field.js';
import { useFileLabels } from '../lib/labels.js';

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Flat File Repository demo: upload, list, preview and delete metadata. */
export default function AttachmentsPage(): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-file-example');
  const labels = useFileLabels();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository('attachments'),
    [manager],
  );
  const [records, setRecords] = useState<readonly FileRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fetchRecords = useCallback(
    async (): Promise<readonly FileRecord[]> =>
      repository.findMany({
        limit: 100,
        sort: (s) => s.field('createdAt').desc(),
      }),
    [repository],
  );

  useEffect(() => {
    let active = true;
    void fetchRecords().then(
      (rows) => {
        if (active) setRecords(rows);
      },
      (cause: unknown) => {
        if (active) setError(messageOf(cause));
      },
    );
    return () => {
      active = false;
    };
  }, [fetchRecords]);

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<void> => {
      setBusy(true);
      setError('');
      try {
        await action();
        setRecords(await fetchRecords());
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    },
    [fetchRecords],
  );

  return (
    <main className='mx-auto max-w-5xl space-y-6 p-8'>
      <header className='space-y-2'>
        <h1 className='text-2xl font-semibold'>{t('title')}</h1>
        <p className='text-sm text-muted-foreground'>{t('description')}</p>
        <p className='text-sm text-muted-foreground'>{t('apiHint')}</p>
      </header>
      <FileUploadField
        repository={repository}
        labels={labels}
        multiple
        disabled={busy}
        onChange={() => run(async () => undefined)}
      />
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      <FileList
        files={records}
        labels={labels}
        disabled={busy}
        onRemove={(file) =>
          run(() => repository.deleteOne({ filter: { id: file.id } }))
        }
      />
      <p className='text-sm text-muted-foreground'>{t('retention')}</p>
    </main>
  );
}
