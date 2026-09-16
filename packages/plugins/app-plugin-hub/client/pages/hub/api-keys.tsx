import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Copy, KeyRound, LoaderCircle, Plus } from 'lucide-react';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Badge } from '../../components/ui/badge.js';
import { AppDialog, ErrorNotification } from './shared.js';
import { formatDateTime } from './utils.js';
import type { HubCapabilities } from '../../permissions.js';
import {
  HUB_API_KEY_SCOPES,
  HUB_API_KEY_ACTIONS,
  type HubApiKeyScope,
  type HubApiKeySummary,
  type CreatedHubApiKey,
} from '../../../shared/api-keys.js';

export function ApiKeys({
  appId,
  appName,
  capabilities,
}: {
  readonly appId: string;
  readonly appName: string;
  readonly capabilities: HubCapabilities;
}): ReactElement {
  const client = useService(apiClientToken);
  const { t, i18n } = useTranslation('@nocobase/app-plugin-hub');
  const [keys, setKeys] = useState<readonly HubApiKeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [scopes, setScopes] = useState<readonly HubApiKeyScope[]>([]);
  const [created, setCreated] = useState<CreatedHubApiKey>();
  const [copied, setCopied] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    key: HubApiKeySummary;
    action: 'disable' | 'delete';
  }>();
  const canManage = capabilities['manage-api-keys'];
  const scopeOptions = HUB_API_KEY_SCOPES.filter(
    (scope) =>
      capabilities[HUB_API_KEY_ACTIONS[scope] as keyof HubCapabilities],
  );
  const path = `hub/apps/${encodeURIComponent(appId)}/api-keys`;
  const load = useCallback(async () => {
    const response = await client.request<{
      data: readonly HubApiKeySummary[];
    }>({ path });
    return response.data;
  }, [client, path]);
  useEffect(() => {
    let cancelled = false;
    if (!canManage) return;
    void load()
      .then((items) => {
        if (!cancelled) setKeys(items);
      })
      .catch(() => {
        if (!cancelled) setError(t('apiKeys.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, canManage, t]);

  const perform = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
      setKeys(await load());
    } catch {
      setError(t('apiKeys.operationFailed'));
    } finally {
      setBusy(false);
    }
  };
  const date = (value: string | null): string =>
    value ? formatDateTime(value, i18n.language) : '—';
  if (!canManage) return <ErrorNotification message={t('apiKeys.noAccess')} />;

  return (
    <section className='space-y-5'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h2 className='font-semibold'>{t('apiKeys.title')}</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            {t('apiKeys.description', { name: appName })}
          </p>
        </div>
        <Button
          variant='outline'
          disabled={busy || !scopeOptions.length}
          onClick={() => {
            setName('');
            setExpiresAt('');
            setScopes([]);
            setError(undefined);
            setCreateOpen(true);
          }}
        >
          <Plus className='size-4' />
          {t('apiKeys.create')}
        </Button>
      </div>
      {error ? (
        <ErrorNotification
          message={error}
          onClose={() => setError(undefined)}
        />
      ) : null}
      {loading ? (
        <div
          role='status'
          className='flex items-center gap-2 text-muted-foreground'
        >
          <LoaderCircle className='size-4 animate-spin' />
          {t('apiKeys.loading')}
        </div>
      ) : !keys.length ? (
        <div className='flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center'>
          <KeyRound className='size-8 text-muted-foreground' />
          <h3 className='font-medium'>{t('apiKeys.empty')}</h3>
          <p className='max-w-lg text-sm text-muted-foreground'>
            {t('apiKeys.emptyDescription')}
          </p>
        </div>
      ) : (
        <div className='overflow-x-auto rounded-xl border'>
          <table className='w-full text-left text-sm'>
            <thead className='border-b bg-muted/40 text-muted-foreground'>
              <tr>
                {[
                  'name',
                  'scopes',
                  'status',
                  'creator',
                  'createdAt',
                  'expiresAt',
                  'lastUsedAt',
                  'actions',
                ].map((column) => (
                  <th
                    key={column}
                    className='whitespace-nowrap px-4 py-3 font-medium'
                  >
                    {t(`apiKeys.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className='border-b last:border-0'>
                  <td className='px-4 py-4'>
                    <div className='font-medium'>{key.name}</div>
                    <code className='text-xs text-muted-foreground'>
                      {key.prefix}…
                    </code>
                  </td>
                  <td className='px-4 py-4'>
                    <div className='flex max-w-64 flex-wrap gap-1'>
                      {key.scopes.map((scope) => (
                        <Badge
                          key={scope}
                          className='bg-muted text-muted-foreground'
                        >
                          {t(`apiKeys.scope.${scope}`)}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className='px-4 py-4'>
                    <Badge
                      className={
                        key.status === 'active'
                          ? 'bg-primary/10 text-primary'
                          : 'border text-muted-foreground'
                      }
                    >
                      {t(`apiKeys.state.${key.status}`)}
                    </Badge>
                  </td>
                  <td className='px-4 py-4'>{key.creatorName}</td>
                  <td className='whitespace-nowrap px-4 py-4'>
                    {date(key.createdAt)}
                  </td>
                  <td className='whitespace-nowrap px-4 py-4'>
                    {key.expiresAt ? date(key.expiresAt) : t('apiKeys.never')}
                  </td>
                  <td className='whitespace-nowrap px-4 py-4'>
                    {date(key.lastUsedAt)}
                  </td>
                  <td className='px-4 py-4'>
                    <div className='flex gap-1'>
                      {key.status === 'active' ? (
                        <Button
                          size='sm'
                          variant='ghost'
                          disabled={busy}
                          onClick={() =>
                            setConfirmation({ key, action: 'disable' })
                          }
                        >
                          {t('apiKeys.disable')}
                        </Button>
                      ) : null}
                      <Button
                        size='sm'
                        variant='ghost'
                        className='text-destructive'
                        disabled={busy}
                        onClick={() =>
                          setConfirmation({ key, action: 'delete' })
                        }
                      >
                        {t('apiKeys.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {createOpen ? (
        <AppDialog
          title={t('apiKeys.create')}
          description={t('apiKeys.description', { name: appName })}
          onClose={() => {
            if (!busy) setCreateOpen(false);
          }}
          footer={
            <>
              <Button
                variant='outline'
                disabled={busy}
                onClick={() => setCreateOpen(false)}
              >
                {t('apiKeys.cancel')}
              </Button>
              <Button
                disabled={busy || !name.trim() || !scopes.length}
                onClick={() =>
                  void perform(async () => {
                    if (
                      expiresAt &&
                      (!Number.isFinite(new Date(expiresAt).getTime()) ||
                        new Date(expiresAt).getTime() <= Date.now())
                    ) {
                      setError(t('apiKeys.invalidExpiry'));
                      return;
                    }
                    const response = await client.request<{
                      data: CreatedHubApiKey;
                    }>({
                      path,
                      method: 'POST',
                      json: {
                        name,
                        scopes,
                        expiresAt: expiresAt
                          ? new Date(expiresAt).toISOString()
                          : null,
                      },
                    });
                    setCreateOpen(false);
                    setCreated(response.data);
                    setCopied(false);
                  })
                }
              >
                {busy ? <LoaderCircle className='size-4 animate-spin' /> : null}
                {t('apiKeys.create')}
              </Button>
            </>
          }
        >
          <div className='space-y-5'>
            <label className='block space-y-2'>
              <span className='text-sm font-medium'>{t('apiKeys.name')}</span>
              <Input
                autoFocus
                value={name}
                maxLength={100}
                disabled={busy}
                placeholder='GitHub Actions'
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className='block space-y-2'>
              <span className='text-sm font-medium'>
                {t('apiKeys.expiresAt')}
              </span>
              <Input
                type='datetime-local'
                value={expiresAt}
                disabled={busy}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <span className='text-xs text-muted-foreground'>
                {t('apiKeys.expiryHint')}
              </span>
            </label>
            <fieldset className='space-y-3'>
              <legend className='mb-3 text-sm font-medium'>
                {t('apiKeys.scopes')}
              </legend>
              {scopeOptions.map((scope) => (
                <label key={scope} className='flex items-center gap-3 text-sm'>
                  <input
                    type='checkbox'
                    className='size-4 accent-primary'
                    checked={scopes.includes(scope)}
                    disabled={busy}
                    onChange={(event) =>
                      setScopes(
                        event.target.checked
                          ? [...scopes, scope]
                          : scopes.filter((item) => item !== scope),
                      )
                    }
                  />
                  {t(`apiKeys.scope.${scope}`)}
                </label>
              ))}
            </fieldset>
          </div>
        </AppDialog>
      ) : null}
      {created ? (
        <AppDialog
          title={t('apiKeys.created')}
          description={t('apiKeys.oneTime')}
          onClose={() => setCreated(undefined)}
          footer={
            <Button onClick={() => setCreated(undefined)}>
              {t('apiKeys.done')}
            </Button>
          }
        >
          <div className='space-y-3'>
            <p className='text-sm font-medium'>{created.key.name}</p>
            <code className='block break-all rounded-lg border bg-muted p-4 text-sm'>
              {created.secret}
            </code>
            <Button
              variant='outline'
              onClick={() => {
                void navigator.clipboard
                  .writeText(created.secret)
                  .then(() => setCopied(true))
                  .catch(() => setError(t('apiKeys.copyFailed')));
              }}
            >
              <Copy className='size-4' />
              {t(copied ? 'apiKeys.copied' : 'apiKeys.copy')}
            </Button>
          </div>
        </AppDialog>
      ) : null}
      {confirmation ? (
        <AppDialog
          title={t(`apiKeys.${confirmation.action}Title`, {
            name: confirmation.key.name,
          })}
          description={t(`apiKeys.${confirmation.action}Description`)}
          onClose={() => {
            if (!busy) setConfirmation(undefined);
          }}
          footer={
            <>
              <Button
                variant='outline'
                disabled={busy}
                onClick={() => setConfirmation(undefined)}
              >
                {t('apiKeys.cancel')}
              </Button>
              <Button
                variant='destructive'
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await client.request({
                      path: `${path}/${confirmation.key.id}${confirmation.action === 'disable' ? '/disable' : ''}`,
                      method:
                        confirmation.action === 'disable' ? 'POST' : 'DELETE',
                    });
                    setConfirmation(undefined);
                  })
                }
              >
                {t(`apiKeys.${confirmation.action}`)}
              </Button>
            </>
          }
        ></AppDialog>
      ) : null}
    </section>
  );
}
