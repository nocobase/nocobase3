import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file-repository/client';
import type { FileRecord } from '@nocobase/app-plugin-file-repository/client';

export default function AttachmentsPage(): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-file-repository-example');
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository('attachments'),
    [manager],
  );
  const [records, setRecords] = useState<FileRecord[]>([]);
  const [selected, setSelected] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setRecords(
      await repository.findMany({
        limit: 100,
        sort: (s) => s.field('createdAt').desc(),
      }),
    );
  }, [repository]);
  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      setError('');
      try {
        await action();
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );
  useEffect(() => {
    let active = true;
    void repository
      .findMany({ limit: 100, sort: (s) => s.field('createdAt').desc() })
      .then(
        (rows) => {
          if (active) setRecords(rows);
        },
        (cause: unknown) => {
          if (active)
            setError(cause instanceof Error ? cause.message : String(cause));
        },
      );
    return () => {
      active = false;
    };
  }, [repository]);
  return (
    <main className='mx-auto max-w-5xl space-y-6 p-8'>
      <h1 className='text-2xl font-semibold'>{t('title')}</h1>
      <p>{t('description')}</p>
      <fieldset
        disabled={busy}
        className='flex flex-wrap items-center gap-4 rounded-lg border p-4'
      >
        <label>
          {t('choose')}{' '}
          <input
            type='file'
            multiple
            onChange={(event) =>
              setSelected(Array.from(event.target.files ?? []))
            }
          />
        </label>
        <button
          className='rounded border px-3 py-2'
          disabled={selected.length !== 1}
          onClick={() => {
            void run(() => repository.uploadOne({ file: selected[0] }));
          }}
        >
          {t('single')}
        </button>
        <button
          className='rounded border px-3 py-2'
          disabled={!selected.length}
          onClick={() => {
            void run(() => repository.uploadMany({ files: selected }));
          }}
        >
          {t('multiple')}
        </button>
        <button
          className='rounded border px-3 py-2'
          onClick={() => {
            void run(async () => undefined);
          }}
        >
          {t('refresh')}
        </button>
      </fieldset>
      {busy && <p role='status'>{t('busy')}</p>}
      {error && (
        <p role='alert' className='text-destructive'>
          {error}
        </p>
      )}
      <p className='text-sm text-muted-foreground'>{t('retention')}</p>
      <table className='w-full text-left'>
        <thead>
          <tr>
            <th>{t('filename')}</th>
            <th>{t('type')}</th>
            <th>{t('size')}</th>
            <th>{t('open')}</th>
            <th>{t('remove')}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr className='border-t' key={record.id}>
              <td className='py-3'>{record.filename}</td>
              <td>{record.mimeType}</td>
              <td>{String(record.size)}</td>
              <td>
                <a
                  className='underline'
                  href={record.contentUrl}
                  target='_blank'
                  rel='noreferrer'
                >
                  {t('open')}
                </a>
              </td>
              <td>
                <button
                  disabled={busy}
                  onClick={() => {
                    void run(() =>
                      repository.deleteOne({ filter: { id: record.id } }),
                    );
                  }}
                >
                  {t('remove')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!records.length && <p>{t('empty')}</p>}
    </main>
  );
}
