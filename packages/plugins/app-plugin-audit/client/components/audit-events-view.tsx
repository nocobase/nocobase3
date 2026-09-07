import { appApiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type {
  AuditEventDto,
  AuditEventsPage,
  AuditEventsQuery,
  AuditEventsViewProps,
} from '../contracts.js';
import { AuditApiClient, auditErrorKey } from '../api-client.js';
import { AuditEventDrawer } from './event-drawer.js';

const control =
  'rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring';
const button = control + ' disabled:opacity-50';

export function AuditEventsView(props: AuditEventsViewProps): ReactElement {
  // A new scope remounts all request state before any previous evidence can render.
  return <Events key={JSON.stringify(props.query)} {...props} />;
}

function Events({ query, onEventSelect }: AuditEventsViewProps): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-audit');
  const client = useService(appApiClientToken);
  const api = useMemo(() => new AuditApiClient(client), [client]);
  const [filters, setFilters] = useState(query);
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([
    query.cursor,
  ]);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<AuditEventsPage>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>();
  const cursor = cursors[page];
  useEffect(() => {
    const controller = new AbortController();
    void api
      .list({ ...filters, cursor }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(auditErrorKey(cause));
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [api, filters, cursor, revision]);
  function reset(): void {
    setLoading(true);
    setData(undefined);
    setError(undefined);
    setSelected(undefined);
  }
  const groups = new Map<string, AuditEventDto[]>();
  for (const event of data?.items ?? []) {
    const key = event.operationId
      ? 'operation:' + event.operationId
      : 'event:' + event.id;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }
  return (
    <section
      className='min-w-0 space-y-4 text-foreground'
      aria-label={t('events.title')}
    >
      <form
        className='grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4'
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          const text = (key: string): string | undefined =>
            typeof values.get(key) === 'string'
              ? (values.get(key) as string).trim() || undefined
              : undefined;
          const kind = text('kind') as AuditEventsQuery['kind'];
          const outcome = text('outcome') as AuditEventsQuery['outcome'];
          const resource = text('resource');
          let key: string | Record<string, string | number> | undefined =
            text('targetKey');
          if (key?.startsWith('{')) {
            try {
              key = JSON.parse(key) as Record<string, string | number>;
            } catch {
              reset();
              setLoading(false);
              setError('events.invalid');
              return;
            }
          }
          reset();
          setCursors([undefined]);
          setPage(0);
          setFilters({
            ...query,
            cursor: undefined,
            action: text('action'),
            kind,
            outcome,
            actorType: text('actorType'),
            actorId: text('actorId'),
            operationId: text('operation'),
            requestId: text('requestId'),
            runId: text('runId'),
            from: text('from')
              ? new Date(text('from') + 'Z').toISOString()
              : undefined,
            to: text('to')
              ? new Date(text('to') + 'Z').toISOString()
              : undefined,
            target:
              query.target ??
              (resource
                ? { resource, dataSource: text('targetSource'), key }
                : undefined),
          });
        }}
      >
        {(
          [
            'action',
            'actorType',
            'actorId',
            'operation',
            'requestId',
            'runId',
            'from',
            'to',
          ] as const
        ).map((name) => (
          <label key={name} className='grid gap-1 text-sm'>
            {t('events.' + name)}
            <input
              className={control}
              name={name}
              type={
                name === 'from' || name === 'to' ? 'datetime-local' : 'text'
              }
              defaultValue={
                name === 'from' || name === 'to'
                  ? query[name]?.replace(/Z$/, '')
                  : query[name === 'operation' ? 'operationId' : name]
              }
            />
          </label>
        ))}
        {(['kind', 'outcome'] as const).map((name) => (
          <label key={name} className='grid gap-1 text-sm'>
            {t('events.' + name)}
            <select
              name={name}
              defaultValue={query[name] ?? ''}
              className={control}
            >
              <option value=''>{t('events.all')}</option>
              {(name === 'kind'
                ? ['request', 'database', 'business']
                : ['success', 'failed', 'denied', 'accepted', 'unknown']
              ).map((value) => (
                <option key={value} value={value}>
                  {t('events.' + value)}
                </option>
              ))}
            </select>
          </label>
        ))}
        {!query.target &&
          (['resource', 'targetSource', 'targetKey'] as const).map((name) => (
            <label key={name} className='grid gap-1 text-sm'>
              {t('events.' + name)}
              <input name={name} className={control} />
            </label>
          ))}
        <div className='flex items-end gap-2'>
          <button type='submit' className={button}>
            {t('events.apply')}
          </button>
          <button
            type='button'
            className={button}
            onClick={() => {
              reset();
              setRevision((value) => value + 1);
            }}
          >
            {t('events.refresh')}
          </button>
        </div>
      </form>
      {query.target && (
        <p className='break-all text-sm'>
          {t('events.target')}: {JSON.stringify(query.target)}
        </p>
      )}
      <p className='text-sm text-muted-foreground'>{t('events.grouping')}</p>
      {loading ? (
        <p role='status'>{t('events.loading')}</p>
      ) : error ? (
        <p
          role='alert'
          className='rounded-md border border-destructive p-4 text-destructive'
        >
          {t(error)}
        </p>
      ) : (
        <>
          {!data?.items.length ? (
            <p role='status'>{t('events.empty')}</p>
          ) : (
            [...groups.entries()].map(([key, items]) => (
              <section
                key={key}
                className='overflow-hidden rounded-lg border border-border bg-card'
              >
                <h3 className='break-all bg-muted px-4 py-3 text-sm font-medium'>
                  {items[0]?.operationId ?? t('events.ungrouped')} ·{' '}
                  {t('events.facts', { count: items.length })}
                </h3>
                <ul className='divide-y divide-border'>
                  {items.map((event) => (
                    <li key={event.id}>
                      <button
                        type='button'
                        className='grid w-full gap-3 p-4 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-2 lg:grid-cols-4'
                        onClick={() => {
                          setSelected(event.id);
                          onEventSelect?.(event.id);
                        }}
                      >
                        <span className='min-w-0 break-words'>
                          <strong>
                            {event.titleKey
                              ? t(event.titleKey, {
                                  defaultValue: event.action,
                                })
                              : event.action}
                          </strong>
                          <span className='block text-xs text-muted-foreground'>
                            {event.action}
                          </span>
                          <time className='text-xs'>{event.occurredAt}</time>
                        </span>
                        <span>
                          {t('events.kind')}: {t('events.' + event.kind)}
                          <span className='block'>
                            {t('events.outcome')}:{' '}
                            {t('events.' + event.outcome)}
                          </span>
                        </span>
                        <span className='break-all'>
                          {t('events.actor')}: {principal(event.actor)}
                          <span className='block'>
                            {t('events.initiator')}:{' '}
                            {event.initiator
                              ? principal(event.initiator)
                              : t('events.unknown')}
                          </span>
                        </span>
                        <span className='break-all'>
                          {t('events.target')}:{' '}
                          {event.target
                            ? JSON.stringify(event.target)
                            : t('events.unknown')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
      <nav
        className='flex items-center justify-between gap-2'
        aria-label={t('events.title')}
      >
        <button
          type='button'
          className={button}
          disabled={loading || page === 0}
          onClick={() => {
            reset();
            setPage(page - 1);
          }}
        >
          {t('events.previous')}
        </button>
        <span>{t('events.page', { page: page + 1 })}</span>
        <button
          type='button'
          className={button}
          disabled={loading || !!error || !data?.nextCursor}
          onClick={() => {
            reset();
            setCursors([...cursors.slice(0, page + 1), data?.nextCursor]);
            setPage(page + 1);
          }}
        >
          {t('events.next')}
        </button>
      </nav>
      {selected && (
        <AuditEventDrawer
          key={selected}
          api={api}
          id={selected}
          scope={filters}
          onClose={() => setSelected(undefined)}
        />
      )}
    </section>
  );
}

function principal(value: AuditEventDto['actor']): string {
  return [value.label, value.type, value.id].filter(Boolean).join(' · ');
}
