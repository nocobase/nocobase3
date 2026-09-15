import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Database, Search } from 'lucide-react';
import {
  useCallback,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useResolvedPath,
  useSearchParams,
} from 'react-router';

import {
  DatabaseExplorerClient,
  type CollectionDetail,
  type CollectionEntry,
  type ConnectionSummary,
} from '../database-explorer-client.js';
import { explorerErrorMessage } from '../lib/errors.js';
import { useResource, type Resource } from '../lib/use-resource.js';
import { DEFAULT_PANE } from '../routes.js';
import { Loading, Notice, Panel, SectionTitle } from './parts.js';

/** What the detail panes read from the parent through the outlet. */
export interface CollectionPaneContext {
  readonly connection?: string;
  readonly collection?: string;
  readonly detail: Resource<CollectionDetail>;
  readonly explorer: DatabaseExplorerClient;
}

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

  // Selection lives in the URL so a view can be linked to and restored.
  const [params, setParams] = useSearchParams();
  const chosenConnection = params.get('connection') ?? undefined;
  const collection = params.get('collection') ?? undefined;
  const [search, setSearch] = useState('');

  const connections = useResource(
    'connections',
    useCallback(() => explorer.connections(), [explorer]),
  );
  const items = connections.value?.items ?? [];
  // Which connection the page opens on is derived rather than stored, so the
  // default needs no effect to install it.
  const connection =
    chosenConnection ?? connections.value?.default ?? items[0]?.name;

  const collections = useResource(
    connection,
    useCallback((name: string) => explorer.allCollections(name), [explorer]),
  );
  const detail = useResource(
    selectionKey(connection, collection),
    useCallback(
      (key: string) => explorer.collection(...readSelection(key)),
      [explorer],
    ),
  );

  // Failures are held as they arrived and read into words during render, so
  // `t` never enters a loader's dependencies: react-i18next replaces it on a
  // language change, which would refetch every pane.
  const message = (error: unknown): string => explorerErrorMessage(error, t);

  const select = (next: { connection?: string; collection?: string }): void => {
    const updated = new URLSearchParams(params);
    if (next.connection !== undefined) {
      updated.set('connection', next.connection);
      updated.delete('collection');
    }
    if (next.collection !== undefined)
      updated.set('collection', next.collection);
    setParams(updated);
  };

  const visible = useMemo(() => {
    const entries: readonly CollectionEntry[] = collections.value?.items ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(term) ||
        entry.tableName.toLowerCase().includes(term),
    );
  }, [collections, search]);

  // Opening the bare page URL lands on the default pane, keeping the selection.
  const page = useResolvedPath('.');
  const location = useLocation();
  if (location.pathname === page.pathname) {
    return (
      <Navigate
        replace
        to={{
          pathname: `${page.pathname}/${DEFAULT_PANE}`,
          search: location.search,
        }}
      />
    );
  }

  const paneLink = (pane: string): string =>
    `${page.pathname}/${pane}${location.search}`;
  const activePane = location.pathname.endsWith(`/${DEFAULT_PANE}`)
    ? DEFAULT_PANE
    : 'columns';

  const context: CollectionPaneContext = {
    ...(connection === undefined ? {} : { connection }),
    ...(collection === undefined ? {} : { collection }),
    detail,
    explorer,
  };

  return (
    <div className='flex flex-col gap-4 p-6'>
      <header>
        <h1 className='font-heading text-2xl font-semibold'>
          {t('page.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>{t('page.description')}</p>
      </header>

      {connections.error ? (
        <Notice tone='destructive'>{message(connections.error)}</Notice>
      ) : null}

      <div className='grid grid-cols-1 gap-4 lg:grid-cols-[16rem_18rem_minmax(0,1fr)]'>
        <Panel label={t('sections.connections')}>
          <SectionTitle>{t('sections.connections')}</SectionTitle>
          <ul className='min-h-0 flex-1 overflow-y-auto p-2'>
            {items.map((item: ConnectionSummary) => (
              <li key={item.name}>
                <button
                  type='button'
                  aria-current={item.name === connection}
                  onClick={() => select({ connection: item.name })}
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
              <li className='p-2 text-sm text-muted-foreground'>
                {t('empty.connections')}
              </li>
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
          {collections.value?.truncated ? (
            <div className='px-2 pt-2'>
              <Notice tone='warning'>{t('states.truncated')}</Notice>
            </div>
          ) : null}
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
                  onClick={() => select({ collection: entry.name })}
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
              <li className='p-2 text-sm text-muted-foreground'>
                {t('empty.collections')}
              </li>
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
              {/*
                Links rather than a tab widget: the panes are routes, so Back
                and a pasted URL restore one. Claiming `role="tab"` would
                promise arrow-key navigation and a tabpanel this does not build.
              */}
              <nav
                aria-label={t('sections.detail')}
                className='flex gap-1 border-b border-border px-4 pt-3'
              >
                <PaneLink
                  to={paneLink(DEFAULT_PANE)}
                  active={activePane === DEFAULT_PANE}
                >
                  {t('tabs.fields')}
                </PaneLink>
                <PaneLink
                  to={paneLink('columns')}
                  active={activePane === 'columns'}
                >
                  {t('tabs.columns')}
                </PaneLink>
              </nav>
              <div className='min-h-0 flex-1 overflow-y-auto'>
                <Outlet context={context} />
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

function PaneLink({
  to,
  active,
  children,
}: {
  readonly to: string;
  readonly active: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={[
        'rounded-t-md px-3 py-1.5 text-sm',
        active
          ? 'border-b-2 border-primary font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      {children}
    </Link>
  );
}

function rowClass(active: boolean): string {
  return [
    'flex w-full flex-col items-start rounded-md px-2 py-2 text-left text-sm',
    active
      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
      : 'hover:bg-accent hover:text-accent-foreground',
  ].join(' ');
}

function Tag({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <span className='rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground'>
      {children}
    </span>
  );
}
