import { appApiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Database,
  RefreshCw,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import type {
  FileInventoryFilesResponse,
  FileInventoryItem,
  FileInventorySource,
  FileInventorySourcesResponse,
} from '../../shared/inventory.js';

const PAGE_SIZE = 25;

export default function FileInventoryPage(): ReactElement {
  const { t } = useTranslation();
  const appClient = useService(appApiClientToken);
  const [sources, setSources] = useState<readonly FileInventorySource[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [page, setPage] = useState(1);
  const [files, setFiles] = useState<readonly FileInventoryItem[]>([]);
  const [fileMeta, setFileMeta] = useState<FileInventoryFilesResponse['meta']>({
    page: 1,
    pageSize: PAGE_SIZE,
    hasNextPage: false,
  });
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [filesLoading, setFilesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState<string>();
  const [filesError, setFilesError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const selectedIdRef = useRef<string | undefined>(undefined);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedId),
    [selectedId, sources],
  );
  const selectedSourceId = selectedSource?.id;

  const refresh = (): void => {
    setSourcesLoading(true);
    setSourcesError(undefined);
    setRevision((value) => value + 1);
  };

  const loadSources = useCallback(
    (signal: AbortSignal): Promise<FileInventorySourcesResponse> =>
      appClient.request<FileInventorySourcesResponse>(
        'files/inventory/sources',
        { signal },
      ),
    [appClient],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSources(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setSources(response.data);
        const current = selectedIdRef.current;
        const next =
          current && response.data.some((source) => source.id === current)
            ? current
            : response.data[0]?.id;
        if (next !== current) {
          const nextSource = response.data.find((source) => source.id === next);
          selectedIdRef.current = next;
          setSelectedId(next);
          setPage(1);
          setFiles([]);
          setFileMeta({
            page: 1,
            pageSize: PAGE_SIZE,
            hasNextPage: false,
          });
          setFilesLoading(Boolean(nextSource));
          setFilesError(undefined);
        }
        setSourcesError(undefined);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSourcesError(
            errorMessage(
              error,
              t('inventory.errors.loadSources', {
                defaultValue: 'Unable to load file sources.',
              }),
            ),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setSourcesLoading(false);
      });
    return () => controller.abort();
  }, [loadSources, revision, t]);

  useEffect(() => {
    if (!selectedSourceId) return;
    const controller = new AbortController();
    const requestSourceId = selectedSourceId;
    const isCurrentRequest = (): boolean =>
      !controller.signal.aborted && selectedIdRef.current === requestSourceId;
    void Promise.resolve().then(() => {
      if (!isCurrentRequest()) return;
      setFilesLoading(true);
      setFilesError(undefined);
    });
    void appClient
      .request<FileInventoryFilesResponse>(
        `files/inventory/sources/${encodeURIComponent(selectedSourceId)}/files?page=${page}&pageSize=${PAGE_SIZE}`,
        { signal: controller.signal },
      )
      .then((response) => {
        if (!isCurrentRequest()) return;
        if (page > 1 && response.data.length === 0) {
          setPage((current) => Math.max(1, current - 1));
          return;
        }
        setFiles(response.data);
        setFileMeta(response.meta);
        setFilesError(undefined);
      })
      .catch((error: unknown) => {
        if (isCurrentRequest()) {
          setFiles([]);
          setFilesError(
            errorMessage(
              error,
              t('inventory.errors.loadFiles', {
                defaultValue: 'Unable to load files from this source.',
              }),
            ),
          );
        }
      })
      .finally(() => {
        if (isCurrentRequest()) setFilesLoading(false);
      });
    return () => controller.abort();
  }, [appClient, page, revision, selectedSourceId, t]);

  const selectSource = (sourceId: string): void => {
    if (sourceId === selectedIdRef.current) return;
    selectedIdRef.current = sourceId;
    setSelectedId(sourceId);
    setPage(1);
    setFiles([]);
    setFileMeta({ page: 1, pageSize: PAGE_SIZE, hasNextPage: false });
  };

  const changePage = (nextPage: number): void => {
    setPage(nextPage);
  };

  return (
    <main className='min-h-[calc(100svh-4rem)] bg-muted/20'>
      <header className='border-b bg-background px-6 py-6'>
        <div className='mx-auto flex w-full max-w-7xl items-end justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-semibold'>
              {t('inventory.title', { defaultValue: 'Files' })}
            </h1>
          </div>
          <button
            className='inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'
            disabled={sourcesLoading}
            onClick={refresh}
            title={t('inventory.refresh', { defaultValue: 'Refresh' })}
            type='button'
          >
            <RefreshCw
              aria-hidden='true'
              className={`size-4 ${sourcesLoading ? 'animate-spin' : ''}`}
            />
            {t('inventory.refresh', { defaultValue: 'Refresh' })}
          </button>
        </div>
      </header>

      <div className='mx-auto w-full max-w-7xl space-y-5 px-6 py-6'>
        {sourcesError ? (
          <ErrorNotice
            title={t('inventory.errors.sourcesUnavailable', {
              defaultValue: 'File sources unavailable',
            })}
            message={sourcesError}
          />
        ) : null}

        <section className='grid min-h-[32rem] overflow-hidden rounded-lg border bg-background shadow-sm lg:grid-cols-[18rem_minmax(0,1fr)]'>
          <aside className='border-b lg:border-r lg:border-b-0'>
            <div className='border-b px-4 py-3'>
              <h2 className='text-sm font-semibold'>
                {t('inventory.sources.title', { defaultValue: 'Sources' })}
              </h2>
            </div>
            <div className='max-h-[38rem] overflow-y-auto p-2'>
              {sourcesLoading && sources.length === 0 ? (
                <p className='px-3 py-8 text-center text-sm text-muted-foreground'>
                  {t('inventory.sources.loading', {
                    defaultValue: 'Loading sources...',
                  })}
                </p>
              ) : sources.length === 0 ? (
                <p className='px-3 py-8 text-center text-sm text-muted-foreground'>
                  {t('inventory.sources.empty', {
                    defaultValue: 'No database file sources are registered.',
                  })}
                </p>
              ) : (
                <div className='space-y-1'>
                  {sources.map((source) => (
                    <SourceButton
                      key={source.id}
                      selected={source.id === selectedId}
                      source={source}
                      onSelect={selectSource}
                    />
                  ))}
                </div>
              )}
            </div>
          </aside>

          <div className='min-w-0'>
            {selectedSource ? (
              <>
                <div className='flex items-center gap-2 border-b px-5 py-4'>
                  <Database aria-hidden='true' className='size-4 shrink-0' />
                  <h2
                    className='truncate font-semibold'
                    title={selectedSource.table}
                  >
                    {selectedSource.table}
                  </h2>
                </div>

                {filesError ? (
                  <div className='p-5'>
                    <ErrorNotice
                      title={t('inventory.files.unavailable', {
                        defaultValue: 'Files unavailable',
                      })}
                      message={filesError}
                    />
                  </div>
                ) : (
                  <FilesTable files={files} loading={filesLoading} />
                )}

                <Pagination
                  meta={fileMeta}
                  loading={filesLoading}
                  onPageChange={changePage}
                />
              </>
            ) : (
              <div className='grid min-h-[32rem] place-items-center px-6 text-center text-sm text-muted-foreground'>
                {t('inventory.files.noSource', {
                  defaultValue: 'No file source selected.',
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function SourceButton({
  source,
  selected,
  onSelect,
}: {
  readonly source: FileInventorySource;
  readonly selected: boolean;
  readonly onSelect: (sourceId: string) => void;
}): ReactElement {
  return (
    <button
      className={`flex min-h-14 w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
        selected ? 'bg-muted font-medium' : 'hover:bg-muted/60'
      }`}
      aria-current={selected ? 'page' : undefined}
      onClick={() => onSelect(source.id)}
      type='button'
    >
      <Database
        aria-hidden='true'
        className='size-4 shrink-0 text-muted-foreground'
      />
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-sm' title={source.table}>
          {source.table}
        </span>
      </span>
    </button>
  );
}

function FilesTable({
  files,
  loading,
}: {
  readonly files: readonly FileInventoryItem[];
  readonly loading: boolean;
}): ReactElement {
  const { t } = useTranslation();
  if (loading && files.length === 0) {
    return (
      <div className='grid min-h-80 place-items-center text-sm text-muted-foreground'>
        {t('inventory.files.loading', { defaultValue: 'Loading files...' })}
      </div>
    );
  }
  if (files.length === 0) {
    return (
      <div className='grid min-h-80 place-items-center text-sm text-muted-foreground'>
        {t('inventory.files.empty', { defaultValue: 'No file records.' })}
      </div>
    );
  }
  return (
    <div className='overflow-x-auto'>
      <table className='w-full min-w-[760px] text-sm'>
        <thead className='bg-muted/35 text-left'>
          <tr className='border-b'>
            <th className='px-4 py-3 font-medium'>
              {t('inventory.files.columns.file', { defaultValue: 'File' })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('inventory.files.columns.disk', { defaultValue: 'Disk' })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('inventory.files.columns.size', { defaultValue: 'Size' })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('inventory.files.columns.visibility', {
                defaultValue: 'Visibility',
              })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('inventory.files.columns.created', {
                defaultValue: 'Created',
              })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('inventory.files.columns.updated', {
                defaultValue: 'Updated',
              })}
            </th>
          </tr>
        </thead>
        <tbody className={loading ? 'opacity-60' : undefined}>
          {files.map((file) => (
            <tr key={file.id} className='border-b last:border-b-0'>
              <td className='max-w-72 px-4 py-3'>
                <div className='truncate font-medium' title={file.filename}>
                  {file.filename}
                </div>
                <div className='truncate text-xs text-muted-foreground'>
                  {file.mimeType}
                </div>
              </td>
              <td className='px-4 py-3 font-mono text-xs text-muted-foreground'>
                {file.disk}
              </td>
              <td className='whitespace-nowrap px-4 py-3 tabular-nums'>
                {formatBytes(file.size)}
              </td>
              <td className='px-4 py-3'>
                <span
                  className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${
                    file.public
                      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'border-border bg-muted/40 text-muted-foreground'
                  }`}
                >
                  {file.public
                    ? t('common.visibility.public', { defaultValue: 'Public' })
                    : t('common.visibility.private', {
                        defaultValue: 'Private',
                      })}
                </span>
              </td>
              <td className='whitespace-nowrap px-4 py-3 text-muted-foreground'>
                {formatDate(file.createdAt)}
              </td>
              <td className='whitespace-nowrap px-4 py-3 text-muted-foreground'>
                {formatDate(file.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({
  meta,
  loading,
  onPageChange,
}: {
  readonly meta: FileInventoryFilesResponse['meta'];
  readonly loading: boolean;
  readonly onPageChange: (page: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex min-h-14 items-center justify-end gap-4 border-t px-4 py-2'>
      <div className='flex items-center gap-2'>
        <span className='min-w-20 text-center text-xs tabular-nums text-muted-foreground'>
          {t('inventory.pagination.page', {
            defaultValue: 'Page {{page}}',
            page: meta.page,
          })}
        </span>
        <button
          aria-label={t('inventory.pagination.previous', {
            defaultValue: 'Previous page',
          })}
          className='grid size-8 place-items-center rounded-md border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40'
          disabled={loading || meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
          title={t('inventory.pagination.previous', {
            defaultValue: 'Previous page',
          })}
          type='button'
        >
          <ChevronLeft aria-hidden='true' className='size-4' />
        </button>
        <button
          aria-label={t('inventory.pagination.next', {
            defaultValue: 'Next page',
          })}
          className='grid size-8 place-items-center rounded-md border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40'
          disabled={loading || !meta.hasNextPage}
          onClick={() => onPageChange(meta.page + 1)}
          title={t('inventory.pagination.next', {
            defaultValue: 'Next page',
          })}
          type='button'
        >
          <ChevronRight aria-hidden='true' className='size-4' />
        </button>
      </div>
    </div>
  );
}

function ErrorNotice({
  title,
  message,
}: {
  readonly title: string;
  readonly message: string;
}): ReactElement {
  return (
    <div className='flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/8 p-4 text-sm text-amber-900 dark:text-amber-200'>
      <AlertTriangle aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
      <div>
        <p className='font-medium'>{title}</p>
        <p className='mt-1 text-xs opacity-85'>{message}</p>
      </div>
    </div>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && amount >= 1024; index += 1) {
    amount /= 1024;
    unit = units[index];
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: amount >= 10 ? 1 : 2 }).format(amount)} ${unit}`;
}

function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
