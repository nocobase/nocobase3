import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Database, LoaderCircle, Search, TriangleAlert } from 'lucide-react';
import {
  useCallback,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { DatabaseExplorerClient } from '../database-explorer-client.js';
import {
  describeFields,
  describeTarget,
  physicalColumns,
  type FieldRow,
} from '../lib/fields.js';
import { useResource } from '../lib/use-resource.js';

type Pane = 'fields' | 'columns';

/** Joins a connection and a collection into the one key their resources share. */
function selectionKey(
  connection: string | undefined,
  collection: string | undefined,
): string | undefined {
  if (connection === undefined || collection === undefined) return undefined;
  return JSON.stringify([connection, collection]);
}

function readSelection(key: string): readonly [string, string] {
  return JSON.parse(key) as [string, string];
}

export default function DatabaseExplorerPage(): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-database-explorer');
  const api = useService(apiClientToken);
  const explorer = useMemo(() => new DatabaseExplorerClient(api), [api]);

  const [chosenConnection, setChosenConnection] = useState<string>();
  const [collection, setCollection] = useState<string>();
  const [search, setSearch] = useState('');
  const [pane, setPane] = useState<Pane>('fields');

  // Failures are held as they arrived and read into words during render.
  // Translating inside a loader would put `t` in its dependencies, and
  // react-i18next replaces `t` whenever the language changes — which would
  // silently refetch every pane on a language switch.
  const message = (error: unknown): string =>
    error instanceof Error && error.message
      ? error.message
      : t('errors.unknown');

  const connections = useResource(
    'connections',
    useCallback(() => explorer.connections(), [explorer]),
  );
  const items = connections.value?.items ?? [];
  // Selection state holds only a deliberate choice. Which connection the page
  // opens on is derived, so installing the default needs no effect and no
  // frame is rendered with nothing selected.
  const connection =
    chosenConnection ?? connections.value?.default ?? items[0]?.name;

  const collections = useResource(
    connection,
    useCallback((name: string) => explorer.collections(name), [explorer]),
  );
  const selection = selectionKey(connection, collection);
  const detail = useResource(
    selection,
    useCallback(
      (key: string) => explorer.collection(...readSelection(key)),
      [explorer],
    ),
  );
  // The physical schema costs a second inspection of the same table, so it is
  // read when the tab is first opened rather than alongside the definition.
  const physical = useResource(
    pane === 'columns' ? selection : undefined,
    useCallback(
      (key: string) => explorer.physicalCollection(...readSelection(key)),
      [explorer],
    ),
  );

  const selectConnection = (name: string): void => {
    setChosenConnection(name);
    setCollection(undefined);
    setPane('fields');
  };
  const selectCollection = (name: string): void => {
    setCollection(name);
    setPane('fields');
  };

  const visible = useMemo(() => {
    const entries = collections.value?.items ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(term) ||
        entry.tableName.toLowerCase().includes(term),
    );
  }, [collections, search]);

  const fields: readonly FieldRow[] = useMemo(
    () =>
      detail.value ? describeFields(detail.value.collection.collection) : [],
    [detail],
  );
  const columns = useMemo(
    () => (physical.value ? physicalColumns(physical.value) : []),
    [physical],
  );
  const warnings = detail.value?.collection.warnings ?? [];

  return (
    <div className='flex h-full flex-col gap-4 p-6'>
      <header>
        <h1 className='font-heading text-2xl font-semibold'>
          {t('page.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>{t('page.description')}</p>
      </header>

      {connections.error ? (
        <Notice tone='destructive'>{message(connections.error)}</Notice>
      ) : null}

      <div className='grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[16rem_18rem_minmax(0,1fr)]'>
        <Panel label={t('sections.connections')}>
          <SectionTitle>{t('sections.connections')}</SectionTitle>
          <ul className='min-h-0 flex-1 overflow-y-auto p-2'>
            {items.map((item) => (
              <li key={item.name}>
                <button
                  type='button'
                  aria-current={item.name === connection}
                  onClick={() => selectConnection(item.name)}
                  className={rowClass(item.name === connection)}
                >
                  <span className='flex items-center gap-2 truncate font-medium'>
                    <Database aria-hidden className='size-4 shrink-0' />
                    <span className='truncate'>{item.name}</span>
                  </span>
                  <span className='mt-1 flex flex-wrap gap-1'>
                    <Tag>{item.dialect}</Tag>
                    <Tag>{t(`schemaManagement.${item.schemaManagement}`)}</Tag>
                    {item.isDefault ? <Tag>{t('labels.default')}</Tag> : null}
                  </span>
                </button>
              </li>
            ))}
            {items.length === 0 &&
            !connections.error &&
            !connections.loading ? (
              <Empty>{t('empty.connections')}</Empty>
            ) : null}
          </ul>
        </Panel>

        <Panel label={t('sections.collections')}>
          <SectionTitle>{t('sections.collections')}</SectionTitle>
          <div className='border-b border-border p-2'>
            <div className='flex items-center gap-2 rounded-md border border-input px-2'>
              <Search aria-hidden className='size-4 text-muted-foreground' />
              <input
                type='search'
                value={search}
                aria-label={t('actions.searchCollections')}
                placeholder={t('actions.searchCollections')}
                onChange={(event) => setSearch(event.target.value)}
                className='w-full bg-transparent py-1.5 text-sm outline-none'
              />
            </div>
          </div>
          <ul className='min-h-0 flex-1 overflow-y-auto p-2'>
            {collections.loading ? (
              <Loading label={t('states.loading')} />
            ) : null}
            {collections.error ? (
              <li className='p-2'>
                <Notice tone='destructive'>{message(collections.error)}</Notice>
              </li>
            ) : null}
            {visible.map((entry) => (
              <li key={entry.name}>
                <button
                  type='button'
                  aria-current={entry.name === collection}
                  onClick={() => selectCollection(entry.name)}
                  className={rowClass(entry.name === collection)}
                >
                  <span className='truncate font-medium'>{entry.name}</span>
                  <span className='truncate text-xs text-muted-foreground'>
                    {entry.tableName}
                  </span>
                </button>
              </li>
            ))}
            {!collections.loading &&
            !collections.error &&
            visible.length === 0 ? (
              <Empty>{t('empty.collections')}</Empty>
            ) : null}
          </ul>
        </Panel>

        <Panel label={t('sections.detail')}>
          {collection === undefined ? (
            <div className='flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground'>
              {t('empty.detail')}
            </div>
          ) : (
            <>
              <SectionTitle>{collection}</SectionTitle>
              <div className='min-h-0 flex-1 overflow-y-auto'>
                {detail.error ? (
                  <div className='p-4'>
                    <Notice tone='destructive'>{message(detail.error)}</Notice>
                  </div>
                ) : null}
                {detail.loading ? (
                  <div className='p-4'>
                    <Loading label={t('states.loading')} />
                  </div>
                ) : null}
                {detail.value ? (
                  <>
                    {warnings.length > 0 ? (
                      <div className='p-4 pb-0'>
                        <Notice tone='warning'>
                          <span className='flex items-center gap-2 font-medium'>
                            <TriangleAlert aria-hidden className='size-4' />
                            {t('labels.warnings')}
                          </span>
                          <ul className='mt-1 list-disc pl-5'>
                            {warnings.map((warning) => (
                              <li key={`${warning.code}:${warning.message}`}>
                                {warning.message}
                              </li>
                            ))}
                          </ul>
                        </Notice>
                      </div>
                    ) : null}
                    <div
                      role='tablist'
                      aria-label={t('sections.detail')}
                      className='flex gap-1 border-b border-border px-4 pt-3'
                    >
                      <Tab
                        active={pane === 'fields'}
                        onSelect={() => setPane('fields')}
                      >
                        {t('tabs.fields')}
                      </Tab>
                      <Tab
                        active={pane === 'columns'}
                        onSelect={() => setPane('columns')}
                      >
                        {t('tabs.columns')}
                      </Tab>
                    </div>
                    {pane === 'fields' ? (
                      <DataTable
                        caption={t('tabs.fields')}
                        headers={[
                          t('fields.name'),
                          t('fields.type'),
                          t('fields.nullable'),
                          t('fields.key'),
                          t('fields.default'),
                          t('fields.target'),
                        ]}
                        rows={fields.map((field) => [
                          field.name,
                          field.type,
                          field.nullable ? t('labels.yes') : t('labels.no'),
                          keyLabel(field, t),
                          field.defaultValue ?? '',
                          describeTarget(field),
                        ])}
                        empty={t('empty.fields')}
                      />
                    ) : physical.error ? (
                      <div className='p-4'>
                        <Notice tone='destructive'>
                          {message(physical.error)}
                        </Notice>
                      </div>
                    ) : physical.loading ? (
                      <div className='p-4'>
                        <Loading label={t('states.loading')} />
                      </div>
                    ) : (
                      <DataTable
                        caption={t('tabs.columns')}
                        headers={[
                          t('columns.name'),
                          t('columns.nativeType'),
                          t('columns.nullable'),
                          t('columns.length'),
                          t('columns.collation'),
                        ]}
                        rows={columns.map((column) => [
                          column.columnName,
                          column.nativeType,
                          column.nullable ? t('labels.yes') : t('labels.no'),
                          column.length === undefined
                            ? ''
                            : String(column.length),
                          column.collation ?? '',
                        ])}
                        empty={t('empty.columns')}
                      />
                    )}
                  </>
                ) : null}
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

/** Names the strongest key a Field participates in, so one column covers both. */
function keyLabel(field: FieldRow, t: (key: string) => string): string {
  if (field.primaryKey) return t('labels.primaryKey');
  if (field.unique) return t('labels.unique');
  return '';
}

function rowClass(active: boolean): string {
  return [
    'flex w-full flex-col items-start rounded-md px-2 py-2 text-left text-sm',
    active
      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
      : 'hover:bg-accent hover:text-accent-foreground',
  ].join(' ');
}

/**
 * One bounded column. Its list scrolls inside it rather than lengthening the
 * page, which a connection with hundreds of collections otherwise does.
 *
 * The cap is written against the viewport because the App shell does not give
 * this page a height to divide up: its main region is `min-h-svh` with a
 * content-sized `flex-1` child, so `h-full` here resolves to `auto` and a
 * `flex-1` row grows to fit its longest column. A panel that caps itself needs
 * nothing from the shell and behaves the same stacked on a phone as it does in
 * three columns.
 */
function Panel({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section
      aria-label={label}
      className='flex max-h-[70svh] min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card'
    >
      {children}
    </section>
  );
}

function SectionTitle({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <h2 className='truncate border-b border-border px-4 py-3 text-sm font-semibold'>
      {children}
    </h2>
  );
}

function Tab({
  active,
  onSelect,
  children,
}: {
  readonly active: boolean;
  readonly onSelect: () => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <button
      type='button'
      role='tab'
      aria-selected={active}
      onClick={onSelect}
      className={[
        'rounded-t-md px-3 py-1.5 text-sm',
        active
          ? 'border-b-2 border-primary font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Tag({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <span className='rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground'>
      {children}
    </span>
  );
}

function Empty({ children }: { readonly children: ReactNode }): ReactElement {
  return <li className='p-2 text-sm text-muted-foreground'>{children}</li>;
}

function Loading({ label }: { readonly label: string }): ReactElement {
  return (
    <div
      role='status'
      className='flex items-center gap-2 p-2 text-sm text-muted-foreground'
    >
      <LoaderCircle aria-hidden className='size-4 animate-spin' />
      {label}
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  readonly tone: 'destructive' | 'warning';
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      role='alert'
      className={[
        'rounded-md border px-3 py-2 text-sm',
        tone === 'destructive'
          ? 'border-destructive text-destructive'
          : 'border-border bg-muted text-muted-foreground',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

function DataTable({
  caption,
  headers,
  rows,
  empty,
}: {
  readonly caption: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly empty: string;
}): ReactElement {
  if (rows.length === 0) {
    return <p className='p-4 text-sm text-muted-foreground'>{empty}</p>;
  }
  return (
    <div className='overflow-x-auto p-4'>
      <table className='w-full border-collapse text-sm'>
        <caption className='sr-only'>{caption}</caption>
        <thead>
          <tr className='border-b border-border text-left'>
            {headers.map((header) => (
              <th key={header} className='px-2 py-2 font-medium'>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className='border-b border-border/60'>
              {headers.map((header, index) => (
                <td
                  key={header}
                  className={
                    index === 0
                      ? 'px-2 py-2 font-medium'
                      : 'px-2 py-2 text-muted-foreground'
                  }
                >
                  {row[index] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
