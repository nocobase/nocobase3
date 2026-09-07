import { Dialog } from '@base-ui/react/dialog';
import { appApiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type {
  AuditSettings,
  AuditSettingsResponse,
  AuditTablePolicy,
} from '../contracts.js';
import {
  SettingsApi,
  settingsError,
  control,
  formText,
} from './settings-api.js';
import { AuditHealthPanel } from './health.js';
import { SettingsSummary } from './settings-summary.js';

function Editor({ store }: { readonly store: string }): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-audit');
  const client = useService(appApiClientToken);
  const api = useMemo(() => new SettingsApi(client), [client]);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [response, setResponse] = useState<AuditSettingsResponse>();
  const [draft, setDraft] = useState<AuditSettings>();
  const [current, setCurrent] = useState<AuditSettingsResponse>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [healthRevision, setHealthRevision] = useState(0);
  const [days, setDays] = useState('180');
  const [conflicted, setConflicted] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void api
      .get(store, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setTargetIds(
            result.data.sources.database.map(() => crypto.randomUUID()),
          );
          setResponse(result);
          setDraft(result.data);
          setDays(String(result.data.retentionDays ?? 180));
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(settingsError(cause));
      });
    return () => controller.abort();
  }, [api, store]);
  const requirements = response?.meta?.requirements;
  const readonly =
    !response?.meta?.canManage || !response.meta.complete || busy || conflicted;
  const requiredAudit =
    !!requirements &&
    (requirements.auditRequired ||
      requirements.mandatorySources.length > 0 ||
      requirements.requiredDataSources.length > 0);
  function change(next: AuditSettings): void {
    setDraft(next);
    setSaved(false);
    setError(undefined);
  }
  function targetRequired(target: AuditTablePolicy): boolean {
    return (
      !!requirements &&
      (requirements.mandatorySources.includes('database') ||
        requirements.requiredDataSources.includes(target.dataSource)) &&
      !!response?.data.sources.database.some(
        (entry) => JSON.stringify(entry) === JSON.stringify(target),
      )
    );
  }
  async function save(confirmed: boolean): Promise<void> {
    if (!draft || !response || readonly) return;
    const retentionDays = draft.retentionDays === null ? null : Number(days);
    if (
      retentionDays !== null &&
      (!/^[0-9]+$/.test(days) ||
        !Number.isSafeInteger(retentionDays) ||
        retentionDays < 1)
    ) {
      setError('settings.invalid');
      return;
    }
    if (
      draft.sources.database.some(
        (target) => !target.dataSource.trim() || !target.table.trim(),
      )
    ) {
      setError('settings.invalid');
      return;
    }
    if (
      !confirmed &&
      retentionDays !== null &&
      (response.data.retentionDays === null ||
        retentionDays < response.data.retentionDays)
    ) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    setError(undefined);
    setSaved(false);
    setConfirm(false);
    try {
      const { revision, ...settings } = draft;
      const result = await api.save(store, {
        expectedRevision: revision,
        settings: { ...settings, retentionDays },
        confirmRetentionReduction: confirmed,
      });
      setResponse({ ...response, data: result });
      setDraft(result);
      setSaved(true);
      setHealthRevision((value) => value + 1);
    } catch (cause) {
      const key = settingsError(cause);
      setError(key);
      if (key === 'settings.conflict') setConflicted(true);
      if (key === 'settings.forbidden')
        setResponse({
          ...response,
          meta: response.meta
            ? { ...response.meta, canManage: false }
            : undefined,
        });
      setHealthRevision((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className='space-y-6'>
      {error && <p role='alert'>{t(error)}</p>}
      {!response && !error && <p role='status'>{t('settings.loading')}</p>}
      {draft && response && (
        <form
          className='space-y-5 rounded-lg border border-border bg-card p-4'
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
        >
          <p>{t('settings.revision', { revision: response.data.revision })}</p>
          {(!response.meta?.canManage || !response.meta.complete) && (
            <p>{t('settings.readonly')}</p>
          )}
          <fieldset disabled={readonly} className='space-y-5'>
            <label className='flex gap-2'>
              <input
                type='checkbox'
                checked={draft.enabled}
                disabled={requiredAudit}
                onChange={(event) =>
                  change({ ...draft, enabled: event.target.checked })
                }
              />
              {t('settings.enabled')}
            </label>
            {requiredAudit && (
              <p className='text-sm text-muted-foreground'>
                {t('settings.mandatory')}
              </p>
            )}
            {(['http', 'runtime'] as const).map((source) => {
              const mandatory = requirements?.mandatorySources.includes(
                source === 'http' ? 'request' : 'business',
              );
              return (
                <div key={source}>
                  <label className='flex gap-2'>
                    <input
                      type='checkbox'
                      checked={draft.sources[source] !== 'disabled'}
                      disabled={mandatory}
                      onChange={(event) =>
                        change({
                          ...draft,
                          sources: {
                            ...draft.sources,
                            [source]: event.target.checked
                              ? source === 'http'
                                ? 'declared-routes'
                                : 'integrated-producers'
                              : 'disabled',
                          },
                        })
                      }
                    />
                    {t('settings.' + source)}
                  </label>
                  {mandatory && (
                    <p className='text-sm text-muted-foreground'>
                      {t('settings.mandatory')}
                    </p>
                  )}
                </div>
              );
            })}
            <label className='grid gap-1'>
              {t('settings.observationStore')}
              <select
                className={control}
                value={draft.observationStore}
                onChange={(event) =>
                  change({ ...draft, observationStore: event.target.value })
                }
              >
                {[
                  ...new Set([
                    draft.observationStore,
                    ...(response.meta?.stores ?? []),
                  ]),
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <section className='space-y-3'>
              <h2 className='font-semibold'>{t('settings.database')}</h2>
              {draft.sources.database.map((target, index) => {
                const mandatory = targetRequired(target);
                return (
                  <fieldset
                    className='grid gap-3 rounded border border-border p-3 sm:grid-cols-4'
                    key={targetIds[index]}
                    disabled={mandatory}
                  >
                    {(['dataSource', 'table', 'schema'] as const).map(
                      (field) => (
                        <label className='grid gap-1' key={field}>
                          {t(
                            'settings.' +
                              (field === 'dataSource' ? 'source' : field),
                          )}
                          <input
                            className={control}
                            required={field !== 'schema'}
                            value={target[field] ?? ''}
                            onChange={(event) =>
                              change({
                                ...draft,
                                sources: {
                                  ...draft.sources,
                                  database: draft.sources.database.map(
                                    (entry, position) =>
                                      position === index
                                        ? {
                                            ...entry,
                                            [field]:
                                              event.target.value || undefined,
                                          }
                                        : entry,
                                  ),
                                },
                              })
                            }
                          />
                        </label>
                      ),
                    )}
                    <button
                      type='button'
                      className={control}
                      onClick={() => {
                        setTargetIds(
                          targetIds.filter((_, position) => position !== index),
                        );
                        change({
                          ...draft,
                          sources: {
                            ...draft.sources,
                            database: draft.sources.database.filter(
                              (_, position) => position !== index,
                            ),
                          },
                        });
                      }}
                    >
                      {t('settings.remove')}
                    </button>
                    {mandatory && (
                      <p className='text-sm sm:col-span-4'>
                        {t('settings.mandatory')}
                      </p>
                    )}
                  </fieldset>
                );
              })}
              <button
                type='button'
                className={control}
                onClick={() => {
                  setTargetIds([...targetIds, crypto.randomUUID()]);
                  change({
                    ...draft,
                    sources: {
                      ...draft.sources,
                      database: [
                        ...draft.sources.database,
                        { dataSource: store, table: '' },
                      ],
                    },
                  });
                }}
              >
                {t('settings.add')}
              </button>
            </section>
            <section className='space-y-3'>
              <label className='flex gap-2'>
                <input
                  type='checkbox'
                  checked={draft.retentionDays === null}
                  onChange={(event) =>
                    change({
                      ...draft,
                      retentionDays: event.target.checked ? null : Number(days),
                    })
                  }
                />
                {t('settings.forever')}
              </label>
              <label className='grid gap-1'>
                {t('settings.retention')}
                <input
                  className={control}
                  inputMode='numeric'
                  disabled={draft.retentionDays === null}
                  value={days}
                  onChange={(event) => {
                    setDays(event.target.value);
                    setSaved(false);
                  }}
                />
              </label>
              <p className='text-sm text-muted-foreground'>
                {t('settings.retentionHelp')}
              </p>
            </section>
            <button className={control} type='submit'>
              {t(busy ? 'settings.saving' : 'settings.save')}
            </button>
          </fieldset>
        </form>
      )}
      {saved && <p role='status'>{t('settings.saved')}</p>}
      {conflicted && (
        <section className='space-y-3'>
          <button
            type='button'
            className={control}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void api
                .get(store)
                .then(setCurrent)
                .catch((cause: unknown) => setError(settingsError(cause)))
                .finally(() => setBusy(false));
            }}
          >
            {t('settings.compare')}
          </button>
          {current && (
            <>
              <div className='grid gap-4 sm:grid-cols-2'>
                {draft && (
                  <section>
                    <h3>{t('settings.draft')}</h3>
                    <SettingsSummary settings={draft} days={days} />
                  </section>
                )}
                <section>
                  <h3>{t('settings.current')}</h3>
                  <SettingsSummary settings={current.data} />
                </section>
              </div>
              <button
                className={control}
                onClick={() => {
                  setTargetIds(
                    current.data.sources.database.map(() =>
                      crypto.randomUUID(),
                    ),
                  );
                  setResponse(current);
                  setDraft(current.data);
                  setDays(String(current.data.retentionDays ?? 180));
                  setCurrent(undefined);
                  setConflicted(false);
                  setError(undefined);
                }}
              >
                {t('settings.useCurrent')}
              </button>
            </>
          )}
        </section>
      )}
      <Dialog.Root open={confirm} onOpenChange={setConfirm}>
        <Dialog.Portal>
          <Dialog.Backdrop className='fixed inset-0 z-50 bg-foreground/30' />
          <Dialog.Popup className='fixed left-1/2 top-1/2 z-50 w-[min(90vw,32rem)] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-lg border border-border bg-background p-6 text-foreground shadow-xl'>
            <Dialog.Title className='text-xl font-semibold'>
              {t('settings.confirmTitle')}
            </Dialog.Title>
            <Dialog.Description>
              {t('settings.confirmDescription')}
            </Dialog.Description>
            <div className='flex gap-3'>
              <Dialog.Close className={control}>
                {t('settings.cancel')}
              </Dialog.Close>
              <button
                className={control}
                disabled={busy}
                onClick={() => void save(true)}
              >
                {t('settings.confirm')}
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <AuditHealthPanel store={store} refresh={healthRevision} />
    </div>
  );
}

export default function AuditSettingsPage(): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-audit');
  const [store, setStore] = useState('main');
  return (
    <main className='space-y-6 p-4 text-foreground sm:p-6'>
      <header>
        <h1 className='text-2xl font-semibold'>{t('settings.title')}</h1>
        <p className='mt-2 text-muted-foreground'>
          {t('settings.description')}
        </p>
      </header>
      <form
        className='flex items-end gap-3'
        onSubmit={(event) => {
          event.preventDefault();
          setStore(formText(event.currentTarget, 'store'));
        }}
      >
        <label className='grid gap-1'>
          {t('settings.store')}
          <input
            className={control}
            name='store'
            defaultValue='main'
            required
          />
        </label>
        <button className={control}>{t('settings.load')}</button>
      </form>
      <Editor key={store} store={store} />
    </main>
  );
}
