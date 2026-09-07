import { Dialog } from '@base-ui/react/dialog';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import type { AuditEventDto, AuditEventsPage } from '../contracts.js';
import {
  AuditApiClient,
  auditErrorKey,
  type AuditReadScope,
} from '../api-client.js';

interface AuditEventDrawerProps {
  readonly api: AuditApiClient;
  readonly id: string;
  readonly scope: AuditReadScope;
  readonly onClose: () => void;
}

export function AuditEventDrawer({
  api,
  id,
  scope,
  onClose,
}: AuditEventDrawerProps): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-audit');
  const [event, setEvent] = useState<AuditEventDto>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void api
      .detail(
        id,
        { store: scope.store, target: scope.target },
        controller.signal,
      )
      .then((data) => {
        if (!controller.signal.aborted) setEvent(data);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(auditErrorKey(cause));
      });
    return () => controller.abort();
  }, [api, id, scope.store, scope.target]);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className='fixed inset-0 z-50 bg-foreground/30' />
        <Dialog.Popup className='fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l border-border bg-background p-4 text-foreground shadow-xl outline-none sm:p-6'>
          <div className='mb-6 flex items-center justify-between gap-4'>
            <Dialog.Title className='text-xl font-semibold'>
              {t('events.details')}
            </Dialog.Title>
            <Dialog.Close className='rounded-md border border-input px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring'>
              {t('events.close')}
            </Dialog.Close>
          </div>
          <Dialog.Description className='mb-4 text-sm text-muted-foreground'>
            {t('events.scope')}
          </Dialog.Description>
          {error ? (
            <p role='alert'>{t(error)}</p>
          ) : !event ? (
            <p role='status'>{t('events.loading')}</p>
          ) : (
            <>
              <EventFacts event={event} />
              <section className='my-6 rounded-md bg-muted p-4 text-sm'>
                {t('events.' + event.kind + 'Proof')}
              </section>
              <dl className='grid grid-cols-1 gap-3 text-sm sm:grid-cols-2'>
                {(
                  [
                    'eventId',
                    'producer',
                    'recordedAt',
                    'store',
                    'requestId',
                    'runId',
                    'operation',
                  ] as const
                ).map((name) => (
                  <div key={name}>
                    <dt className='text-muted-foreground'>
                      {t('events.' + name)}
                    </dt>
                    <dd className='break-all'>
                      {event[
                        name === 'eventId'
                          ? 'id'
                          : name === 'operation'
                            ? 'operationId'
                            : name
                      ] ?? t('events.unknown')}
                    </dd>
                  </div>
                ))}
              </dl>
              <h3 className='mt-6 font-semibold'>{t('events.metadata')}</h3>
              <pre className='mt-2 whitespace-pre-wrap break-all rounded-md bg-muted p-4 text-xs'>
                {JSON.stringify(
                  {
                    http: event.http,
                    database: event.database,
                    details: event.details,
                    source: event.source,
                    captureWarnings: event.captureWarnings,
                    reasonCode: event.reasonCode,
                  },
                  null,
                  2,
                )}
              </pre>
              {event.operationId && (
                <RelatedFacts
                  api={api}
                  operationId={event.operationId}
                  scope={scope}
                />
              )}
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EventFacts({
  event,
}: {
  readonly event: AuditEventDto;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-audit');
  const principal = (value: AuditEventDto['actor']): string =>
    [value.label, value.type, value.id].filter(Boolean).join(' · ');
  const values = {
    actor: principal(event.actor),
    initiator: event.initiator
      ? principal(event.initiator)
      : t('events.unknown'),
    action: event.action,
    target: event.target ? JSON.stringify(event.target) : t('events.unknown'),
    time: event.occurredAt,
    outcome: t('events.' + event.outcome),
    kind: t('events.' + event.kind),
  };
  return (
    <dl className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
      {Object.entries(values).map(([name, value]) => (
        <div key={name}>
          <dt className='text-sm text-muted-foreground'>
            {t('events.' + name)}
          </dt>
          <dd className='break-all font-medium'>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RelatedFacts({
  api,
  operationId,
  scope,
}: {
  readonly api: AuditApiClient;
  readonly operationId: string;
  readonly scope: AuditReadScope;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-audit');
  const [data, setData] = useState<AuditEventsPage>();
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void api
      .operation(
        operationId,
        { store: scope.store, target: scope.target },
        cursor,
        controller.signal,
      )
      .then((page) => {
        if (!controller.signal.aborted) {
          setData((previous) => ({
            ...page,
            items: [...(previous?.items ?? []), ...page.items],
          }));
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(auditErrorKey(cause));
          setData(undefined);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [api, operationId, scope.store, scope.target, cursor]);
  return (
    <section className='mt-6 space-y-4'>
      <h3 className='font-semibold'>{t('events.related')}</h3>
      <p className='text-sm text-muted-foreground'>{t('events.grouping')}</p>
      {error ? (
        <p role='alert'>{t(error)}</p>
      ) : (
        <ul className='space-y-4'>
          {data?.items.map((item) => (
            <li key={item.id} className='rounded-md border border-border p-3'>
              <EventFacts event={item} />
              <p className='mt-3 text-sm text-muted-foreground'>
                {t('events.' + item.kind + 'Proof')}
              </p>
            </li>
          ))}
        </ul>
      )}
      {loading && <p role='status'>{t('events.loading')}</p>}
      {!loading && !error && !data?.items.length && (
        <p role='status'>{t('events.empty')}</p>
      )}
      {data?.nextCursor && (
        <button
          type='button'
          className='rounded-md border border-input px-3 py-2 disabled:opacity-50'
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setCursor(data.nextCursor);
          }}
        >
          {t('events.more')}
        </button>
      )}
    </section>
  );
}
