import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import {
  MailAccountCard,
  MailPageHeader,
  MailProviderCard,
  MailStatusBadge,
  MailSyncPolicyFields,
  type MailSyncPolicyValue,
} from '../components/index.js';
import {
  mailErrorMessage,
  type MailAccountView,
  type MailProviderView,
  type MailSyncRunView,
} from '../mail-client.js';
import { getMailClient } from '../runtime.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';

const mail = getMailClient();

export default function MailSettingsPage(): ReactElement {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<readonly MailProviderView[]>([]);
  const [accounts, setAccounts] = useState<readonly MailAccountView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [connecting, setConnecting] = useState<string>();
  const [syncing, setSyncing] = useState<string>();
  const [syncRuns, setSyncRuns] = useState<
    Readonly<Record<string, MailSyncRunView>>
  >({});
  const [policy, setPolicy] = useState<MailSyncPolicyValue>(() => ({
    receivedAfter: dateDaysAgo(90),
    maxMessages: 10_000,
    batchSize: 200,
  }));

  const refresh = useCallback((): void => {
    setLoading(true);
    setError(undefined);
    void Promise.all([mail.listProviders(), mail.listAccounts()])
      .then(([nextProviders, nextAccounts]) => {
        setProviders(nextProviders);
        setAccounts(nextAccounts);
      })
      .catch((cause: unknown) => {
        setError(
          mailErrorMessage(
            cause,
            t('errors.requestFailed', {
              defaultValue: 'Mail request failed.',
            }),
          ),
        );
      })
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  useEffect(() => {
    const activeRuns = Object.values(syncRuns).filter((run) =>
      ['pending', 'running'].includes(run.status),
    );
    if (activeRuns.length === 0) return undefined;
    const timer = window.setInterval(() => {
      for (const run of activeRuns) {
        void mail.getSyncRun(run.id).then(
          (nextRun) => {
            setSyncRuns((current) => ({
              ...current,
              [nextRun.accountId]: nextRun,
            }));
            if (!['pending', 'running'].includes(nextRun.status)) {
              setSyncing((current) =>
                current === nextRun.accountId ? undefined : current,
              );
            }
          },
          (cause: unknown) => {
            setError(
              mailErrorMessage(
                cause,
                t('errors.requestFailed', {
                  defaultValue: 'Mail request failed.',
                }),
              ),
            );
            setSyncRuns((current) => {
              const next = { ...current };
              delete next[run.accountId];
              return next;
            });
            setSyncing((current) =>
              current === run.accountId ? undefined : current,
            );
          },
        );
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [syncRuns, t]);

  const providerLabels = useMemo(
    () =>
      new Map(
        providers.map((provider) => [provider.name, provider.label] as const),
      ),
    [providers],
  );

  const connect = (provider: MailProviderView): void => {
    setConnecting(provider.name);
    setError(undefined);
    void mail
      .startAuthorization({ type: provider.type, name: provider.name })
      .then((authorization) =>
        window.location.assign(authorization.authorizationUrl),
      )
      .catch((cause: unknown) => {
        setError(
          mailErrorMessage(
            cause,
            t('errors.authorizationFailed', {
              defaultValue: 'Could not start mail authorization.',
            }),
          ),
        );
        setConnecting(undefined);
      });
  };

  const startSync = (account: MailAccountView): void => {
    setSyncing(account.id);
    setError(undefined);
    void mail
      .startSync({
        accountId: account.id,
        receivedAfter: policy.receivedAfter
          ? new Date(`${policy.receivedAfter}T00:00:00Z`).toISOString()
          : undefined,
        maxMessages: policy.maxMessages,
        batchSize: policy.batchSize,
      })
      .then((run) =>
        setSyncRuns((current) => ({ ...current, [account.id]: run })),
      )
      .catch((cause: unknown) => {
        setError(
          mailErrorMessage(
            cause,
            t('errors.syncFailed', {
              defaultValue: 'Could not start mailbox synchronization.',
            }),
          ),
        );
        setSyncing(undefined);
      });
  };

  const authorizationNotice = readAuthorizationNotice();

  return (
    <section className='min-h-[calc(100svh-4rem)] bg-muted/20'>
      <MailPageHeader
        actions={
          <Button disabled={loading} onClick={refresh} variant='outline'>
            <RefreshCw
              aria-hidden='true'
              className={`size-4 ${loading ? 'animate-spin' : ''}`}
            />
            {t('actions.refresh', { defaultValue: 'Refresh' })}
          </Button>
        }
        description={t('settings.description', {
          defaultValue:
            'Connect a mailbox and control how much history the first synchronization imports.',
        })}
        eyebrow={t('settings.eyebrow', { defaultValue: 'Communication' })}
        title={t('settings.title', { defaultValue: 'Mail settings' })}
      />

      <div className='mx-auto w-full max-w-7xl space-y-6 px-6 py-6'>
        {authorizationNotice ? (
          <div
            className={`rounded-xl border p-4 text-sm ${authorizationNotice === 'success' ? 'border-primary/30 bg-primary/10 text-primary' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}
          >
            {authorizationNotice === 'success'
              ? t('settings.authorizationSuccess', {
                  defaultValue: 'The mail account is connected.',
                })
              : t('settings.authorizationFailure', {
                  defaultValue:
                    'The mail account could not be connected. Try again.',
                })}
          </div>
        ) : null}

        {error ? (
          <div className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>
            {error}
          </div>
        ) : null}

        <Card className='p-5 shadow-sm'>
          <div className='mb-4'>
            <h2 className='font-semibold'>
              {t('settings.initialSync.title', {
                defaultValue: 'Initial sync limits',
              })}
            </h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              {t('settings.initialSync.description', {
                defaultValue:
                  'Bound the first import so a large mailbox is processed in resumable batches. Incremental sync takes over after the baseline completes.',
              })}
            </p>
          </div>
          <MailSyncPolicyFields
            labels={{
              receivedAfter: t('settings.initialSync.receivedAfter', {
                defaultValue: 'Import messages received after',
              }),
              maxMessages: t('settings.initialSync.maxMessages', {
                defaultValue: 'Maximum messages',
              }),
              batchSize: t('settings.initialSync.batchSize', {
                defaultValue: 'Messages per batch',
              }),
            }}
            onChange={setPolicy}
            value={policy}
          />
        </Card>

        <section>
          <div className='mb-3'>
            <h2 className='font-semibold'>
              {t('settings.providers.title', { defaultValue: 'Providers' })}
            </h2>
            <p className='text-sm text-muted-foreground'>
              {t('settings.providers.description', {
                defaultValue:
                  'Only Providers configured and enabled by the server are shown.',
              })}
            </p>
          </div>
          {loading ? (
            <LoadingState
              label={t('settings.loading', {
                defaultValue: 'Loading mail configuration…',
              })}
            />
          ) : providers.length === 0 ? (
            <EmptyState
              description={t('settings.providers.emptyDescription', {
                defaultValue:
                  'Add a Gmail or Microsoft Provider to the server mail configuration.',
              })}
              title={t('settings.providers.emptyTitle', {
                defaultValue: 'No mail Providers configured',
              })}
            />
          ) : (
            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
              {providers.map((provider) => (
                <MailProviderCard
                  capabilityLabel={(capability) =>
                    t(`capabilities.${capability}`, {
                      defaultValue: capability,
                    })
                  }
                  connectLabel={t('settings.providers.connect', {
                    defaultValue: 'Connect account',
                  })}
                  connectedAccounts={
                    accounts.filter(
                      (account) => account.provider.name === provider.name,
                    ).length
                  }
                  connectedLabel={t('settings.providers.connected', {
                    defaultValue: '{{count}} connected',
                    count: accounts.filter(
                      (account) => account.provider.name === provider.name,
                    ).length,
                  })}
                  connecting={connecting === provider.name}
                  key={`${provider.type}:${provider.name}`}
                  onConnect={connect}
                  provider={provider}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className='mb-3'>
            <h2 className='font-semibold'>
              {t('settings.accounts.title', {
                defaultValue: 'Connected accounts',
              })}
            </h2>
            <p className='text-sm text-muted-foreground'>
              {t('settings.accounts.description', {
                defaultValue:
                  'Start a bounded initial import, then request incremental synchronization whenever needed.',
              })}
            </p>
          </div>
          {!loading && accounts.length === 0 ? (
            <EmptyState
              description={t('settings.accounts.emptyDescription', {
                defaultValue: 'Connect a Provider above to add a mailbox.',
              })}
              title={t('settings.accounts.emptyTitle', {
                defaultValue: 'No accounts connected',
              })}
            />
          ) : (
            <div className='space-y-3'>
              {accounts.map((account) => {
                const run = syncRuns[account.id];
                return (
                  <div className='space-y-2' key={account.id}>
                    <MailAccountCard
                      account={account}
                      defaultLabel={t('settings.accounts.default', {
                        defaultValue: 'Default',
                      })}
                      onSync={startSync}
                      providerLabel={
                        providerLabels.get(account.provider.name) ??
                        account.provider.name
                      }
                      statusLabel={t(`status.account.${account.status}`, {
                        defaultValue: account.status,
                      })}
                      syncLabel={t('settings.accounts.sync', {
                        defaultValue: 'Sync mailbox',
                      })}
                      syncing={
                        syncing === account.id ||
                        (run !== undefined &&
                          ['pending', 'running'].includes(run.status))
                      }
                    />
                    {run ? <SyncProgress run={run} /> : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function SyncProgress({
  run,
}: {
  readonly run: MailSyncRunView;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-wrap items-center gap-2 rounded-lg border bg-background px-4 py-3 text-sm'>
      <MailStatusBadge
        label={t(`status.sync.${run.status}`, { defaultValue: run.status })}
        tone={syncStatusTone(run.status)}
      />
      <span>
        {t('settings.accounts.syncProgress', {
          defaultValue: '{{messages}} messages in {{pages}} batches',
          messages: run.processedMessages,
          pages: run.processedPages,
        })}
      </span>
      <span className='text-muted-foreground'>· {run.phase}</span>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}): ReactElement {
  return (
    <div className='rounded-xl border border-dashed bg-background p-8 text-center'>
      <p className='font-medium'>{title}</p>
      <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
    </div>
  );
}

function LoadingState({ label }: { readonly label: string }): ReactElement {
  return (
    <div className='rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground'>
      {label}
    </div>
  );
}

function syncStatusTone(
  status: MailSyncRunView['status'],
): 'success' | 'danger' | 'info' {
  if (status === 'completed') return 'success';
  if (status === 'failed' || status === 'cancelled') return 'danger';
  return 'info';
}

function dateDaysAgo(days: number): string {
  const value = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return value.toISOString().slice(0, 10);
}

function readAuthorizationNotice(): 'success' | 'failure' | undefined {
  if (typeof window === 'undefined') return undefined;
  const value = new URLSearchParams(window.location.search).get(
    'mailAuthorization',
  );
  return value === 'success' || value === 'failure' ? value : undefined;
}
