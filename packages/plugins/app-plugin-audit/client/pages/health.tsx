import { appApiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { AuditHealthDto } from '../contracts.js';
import {
  SettingsApi,
  settingsError,
  control,
  formText,
} from './settings-api.js';

export function AuditHealthPanel({
  store,
  refresh = 0,
}: {
  readonly store: string;
  readonly refresh?: number;
}): ReactElement {
  return <Health key={store} store={store} refresh={refresh} />;
}

function Health({
  store,
  refresh,
}: {
  readonly store: string;
  readonly refresh: number;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-audit');
  const client = useService(appApiClientToken);
  const api = useMemo(() => new SettingsApi(client), [client]);
  const [instance, setInstance] = useState('');
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<AuditHealthDto>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void api
      .health(store, instance, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError(undefined);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(settingsError(cause));
          setData(undefined);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [api, store, instance, revision, refresh]);
  const yes = (value: boolean): string =>
    t(value ? 'settings.yes' : 'settings.no');
  return (
    <section
      className='space-y-4 rounded-lg border border-border bg-card p-4 text-foreground'
      aria-label={t('settings.health')}
    >
      <h2 className='text-xl font-semibold'>{t('settings.health')}</h2>
      <p className='text-sm text-muted-foreground'>{t('settings.scope')}</p>
      <form
        className='flex flex-wrap items-end gap-3'
        onSubmit={(event) => {
          event.preventDefault();
          setData(undefined);
          setLoading(true);
          setError(undefined);
          setInstance(formText(event.currentTarget, 'instance'));
          setRevision((value) => value + 1);
        }}
      >
        <label className='grid gap-1'>
          {t('settings.instance')}
          <input name='instance' className={control} />
        </label>
        <button className={control}>{t('settings.refresh')}</button>
      </form>
      {loading && <p role='status'>{t('settings.loading')}</p>}
      {error && <p role='alert'>{t(error)}</p>}
      {data && (
        <>
          <p className='text-lg font-semibold' role='status'>
            {t('settings.states.' + data.state)}
          </p>
          {data.observation === 'unknown' && (
            <p role='status'>{t('settings.unknownObservation')}</p>
          )}
          <dl className='grid gap-2 sm:grid-cols-3'>
            <div>
              <dt>{t('settings.instance')}</dt>
              <dd className='break-all'>{data.instanceId}</dd>
            </div>
            <div>
              <dt>{t('settings.source')}</dt>
              <dd>{store}</dd>
            </div>
            <div>
              <dt>{t('settings.time')}</dt>
              <dd>{data.observedAt ?? t('settings.unknown')}</dd>
            </div>
          </dl>
          <p className='text-sm text-muted-foreground'>
            {t('settings.coverageHelp')}
          </p>
          {data.coverage.length === 0 ? (
            <p>{t('settings.noCoverage')}</p>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-left text-sm'>
                <thead>
                  <tr>
                    {[
                      'producer',
                      'source',
                      'configured',
                      'registered',
                      'observed',
                      'success',
                      'error',
                    ].map((key) => (
                      <th className='p-2' key={key}>
                        {t('settings.' + key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.coverage.map((entry) => (
                    <tr
                      className='border-t border-border'
                      key={JSON.stringify([entry.producer, entry.store])}
                    >
                      <td className='p-2'>{entry.producer}</td>
                      <td>{entry.store}</td>
                      <td>{yes(entry.configured)}</td>
                      <td>{yes(entry.registered)}</td>
                      <td>{yes(entry.observed)}</td>
                      <td>{entry.lastSuccessAt ?? t('settings.unknown')}</td>
                      <td>
                        {entry.lastError
                          ? entry.lastError.code +
                            ' · ' +
                            entry.lastError.occurredAt
                          : t('settings.no')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3 className='font-semibold'>{t('settings.bound')}</h3>
          {data.captures ? (
            <ul className='space-y-2'>
              {data.captures.map((entry) => (
                <li
                  className='rounded border border-border p-3'
                  key={JSON.stringify(entry)}
                >
                  <p>
                    {entry.producer} · {t('events.' + entry.kind)} ·{' '}
                    {entry.dataSource}
                  </p>
                  <p>
                    {t('settings.registered')}: {yes(entry.registered)} ·{' '}
                    {t('settings.verified')}: {yes(entry.verified)}
                  </p>
                  <ul>
                    {entry.targets.map((target) => (
                      <li key={JSON.stringify(target)}>
                        {target.dataSource} /{' '}
                        {target.schema ? target.schema + '.' : ''}
                        {target.table}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('settings.noCaptures')}</p>
          )}
          <h3 className='font-semibold'>{t('settings.declarations')}</h3>
          <p className='text-sm text-muted-foreground'>
            {t('settings.declarationsHelp')}
          </p>
          {data.declarationObservation !== 'static' ? (
            <p>{t('settings.declarationUnknown')}</p>
          ) : (
            <ul>
              {data.declaredRoutes?.map((route) => (
                <li key={JSON.stringify(route)}>
                  {route.method} {route.path} · {route.action}
                </li>
              ))}
            </ul>
          )}
          {data.cleanup && (
            <section>
              <h3>{t('settings.cleanup')}</h3>
              <p>
                {data.cleanup.store} · {data.cleanup.occurredAt}
              </p>
              <p>
                {t('settings.cutoff')}: {data.cleanup.cutoff}
              </p>
              <p>
                {t('settings.deleted')}: {data.cleanup.deletedCount}
              </p>
            </section>
          )}
        </>
      )}
    </section>
  );
}

export default function AuditHealthPage(): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-audit');
  const [store, setStore] = useState('main');
  return (
    <main className='space-y-6 p-4 text-foreground sm:p-6'>
      <h1 className='text-2xl font-semibold'>{t('settings.health')}</h1>
      <form
        className='flex gap-3'
        onSubmit={(event) => {
          event.preventDefault();
          setStore(formText(event.currentTarget, 'store'));
        }}
      >
        <label className='grid gap-1'>
          {t('settings.source')}
          <input
            className={control}
            name='store'
            defaultValue='main'
            required
          />
        </label>
        <button className={control}>{t('settings.load')}</button>
      </form>
      <AuditHealthPanel store={store} />
    </main>
  );
}
