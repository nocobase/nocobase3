import { Mail, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import {
  MailAccountConnector,
  MailDevPageShell,
  MailStatusBadge,
  MailSyncPolicyFields,
  MailSignatureManager,
  type MailSyncPolicyValue,
  type MailStatusTone,
  type MailAccountCredentials,
} from '../components/index.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import {
  mailErrorMessage,
  type MailAccountView,
  type MailProviderView,
  type MailIdentity,
  type MailSyncRunView,
} from '../mail-client.js';
import { getMailClient } from '../runtime.js';

const mail = getMailClient();

export default function MailAccountsDevPage(): ReactElement {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<readonly MailProviderView[]>([]);
  const [accounts, setAccounts] = useState<readonly MailAccountView[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingProviderName, setConnectingProviderName] =
    useState<string>();
  const [syncing, setSyncing] = useState<string>();
  const [syncRuns, setSyncRuns] = useState<
    Readonly<Record<string, MailSyncRunView>>
  >({});
  const [policy, setPolicy] = useState<MailSyncPolicyValue>(() => ({
    receivedAfter: dateDaysAgo(90),
    maxMessages: 10_000,
    batchSize: 200,
  }));
  const [error, setError] = useState<string>();
  const [accountIdentities, setAccountIdentities] = useState<
    Readonly<Record<string, readonly MailIdentity[]>>
  >({});
  const authorizationNotice = readAuthorizationNotice();

  const refresh = useCallback((): void => {
    setLoading(true);
    setError(undefined);
    void Promise.all([mail.listProviders(), mail.listAccounts()])
      .then(([nextProviders, nextAccounts]) => {
        setProviders(nextProviders);
        setAccounts(nextAccounts);
        void Promise.all(
          nextAccounts.map(
            async (account) =>
              [account.id, await mail.listIdentities(account.id)] as const,
          ),
        ).then(
          (entries) => {
            setAccountIdentities(Object.fromEntries(entries));
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
          },
        );
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
        providers.map(
          (provider) => [providerKey(provider), provider.label] as const,
        ),
      ),
    [providers],
  );

  const connect = (provider: MailProviderView): void => {
    setConnectingProviderName(provider.name);
    setError(undefined);
    void mail
      .startAuthorization({ type: provider.type, name: provider.name })
      .then((authorization) => {
        window.location.assign(authorization.authorizationUrl);
      })
      .catch((cause: unknown) => {
        setError(
          mailErrorMessage(
            cause,
            t('errors.authorizationFailed', {
              defaultValue: 'Could not start mail authorization.',
            }),
          ),
        );
        setConnectingProviderName(undefined);
      });
  };

  const connectWithCredentials = (
    provider: MailProviderView,
    credentials: MailAccountCredentials,
  ): void => {
    setConnectingProviderName(provider.name);
    setError(undefined);
    void mail
      .connectAccount({
        type: provider.type,
        name: provider.name,
        ...credentials,
      })
      .then(() => {
        setConnectingProviderName(undefined);
        refresh();
      })
      .catch((cause: unknown) => {
        setError(
          mailErrorMessage(
            cause,
            t('errors.authorizationFailed', {
              defaultValue: 'Could not connect the mail account.',
            }),
          ),
        );
        setConnectingProviderName(undefined);
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

  const updateAccount = (
    account: MailAccountView,
    change: {
      readonly status?: 'active' | 'suspended';
      readonly isDefault?: boolean;
    },
  ): void => {
    setError(undefined);
    void mail
      .updateAccount({ accountId: account.id, ...change })
      .then(refresh, (cause: unknown) =>
        setError(
          mailErrorMessage(
            cause,
            t('errors.requestFailed', { defaultValue: 'Mail request failed.' }),
          ),
        ),
      );
  };

  const removeAccount = (account: MailAccountView): void => {
    setError(undefined);
    void mail
      .removeAccount(account.id)
      .then(refresh, (cause: unknown) =>
        setError(
          mailErrorMessage(
            cause,
            t('errors.requestFailed', { defaultValue: 'Mail request failed.' }),
          ),
        ),
      );
  };

  return (
    <MailDevPageShell
      actions={
        <Button disabled={loading} onClick={refresh} variant='outline'>
          <RefreshCw
            aria-hidden='true'
            className={`size-4 ${loading ? 'animate-spin' : ''}`}
          />
          {t('actions.refresh', { defaultValue: 'Refresh' })}
        </Button>
      }
      badge={t('nav.settings', { defaultValue: 'Mail' })}
      category={t('dev.accountsCategory', {
        defaultValue: 'Account access',
      })}
      description={t('dev.accountsDescription', {
        defaultValue:
          'Connect Gmail, Microsoft, or IMAP/SMTP accounts, configure initial sync limits, and synchronize current-user mailboxes.',
      })}
      title={t('dev.accountsTitle', { defaultValue: 'Mail accounts' })}
    >
      <div className='space-y-6 pb-12'>
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

        <Card className='overflow-hidden rounded-2xl bg-background shadow-sm'>
          <div className='border-b bg-muted/20 px-6 py-5'>
            <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
              {t('dev.syncPolicyCategory', {
                defaultValue: 'Synchronization policy',
              })}
            </p>
            <h2 className='mt-2 font-semibold'>
              {t('settings.initialSync.title', {
                defaultValue: 'Initial sync limits',
              })}
            </h2>
            <p className='mt-1 text-sm leading-6 text-muted-foreground'>
              {t('settings.initialSync.description', {
                defaultValue:
                  'Bound the first import so a large mailbox is processed in resumable batches. Incremental sync takes over after the baseline completes.',
              })}
            </p>
          </div>
          <div className='p-6'>
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
          </div>
        </Card>

        <div className='grid items-start gap-6 xl:grid-cols-[minmax(20rem,5fr)_minmax(0,7fr)]'>
          <Card className='overflow-hidden rounded-2xl bg-background shadow-sm'>
            <div className='border-b bg-muted/20 px-6 py-5'>
              <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
                {t('dev.accountConnectionStep', {
                  defaultValue: 'Account connection',
                })}
              </p>
              <h2 className='mt-2 font-semibold'>
                {t('settings.providers.title', {
                  defaultValue: 'Add mail account',
                })}
              </h2>
              <p className='mt-1 text-sm leading-6 text-muted-foreground'>
                {t('settings.providers.description', {
                  defaultValue:
                    'Choose an account type, then authorize it or enter its mailbox credentials.',
                })}
              </p>
            </div>

            <div className='p-6'>
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
                      'Add a Gmail, Microsoft, or IMAP/SMTP Provider to the server mail configuration.',
                  })}
                  title={t('settings.providers.emptyTitle', {
                    defaultValue: 'No mail Providers configured',
                  })}
                />
              ) : (
                <MailAccountConnector
                  connectedAccountCount={(provider) =>
                    accounts.filter(
                      (account) =>
                        account.provider.type === provider.type &&
                        account.provider.name === provider.name,
                    ).length
                  }
                  connectingProviderName={connectingProviderName}
                  labels={{
                    accountType: t('settings.providers.accountType', {
                      defaultValue: 'Mail account type',
                    }),
                    chooseAccountType: t(
                      'settings.providers.chooseAccountType',
                      { defaultValue: 'Select an account type' },
                    ),
                    connect: t('settings.providers.connect', {
                      defaultValue: 'Connect account',
                    }),
                    connecting: t('settings.providers.connecting', {
                      defaultValue: 'Opening authorization…',
                    }),
                    connectedAccounts: (count) =>
                      t('settings.providers.connected', {
                        count,
                        defaultValue: '{{count}} connected',
                      }),
                    capability: (capability) =>
                      t(`capabilities.${capability}`, {
                        defaultValue: capability,
                      }),
                    emailAddress: t('settings.providers.emailAddress', {
                      defaultValue: 'Email address',
                    }),
                    username: t('settings.providers.username', {
                      defaultValue: 'Username',
                    }),
                    password: t('settings.providers.password', {
                      defaultValue: 'Password',
                    }),
                    displayName: t('settings.providers.displayName', {
                      defaultValue: 'Display name',
                    }),
                  }}
                  onConnect={connect}
                  onConnectCredentials={connectWithCredentials}
                  providers={providers}
                />
              )}
            </div>
          </Card>

          <Card className='overflow-hidden rounded-2xl bg-background shadow-sm'>
            <div className='flex flex-wrap items-start justify-between gap-4 border-b bg-muted/20 px-6 py-5'>
              <div>
                <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
                  {t('dev.accountInventory', {
                    defaultValue: 'Account inventory',
                  })}
                </p>
                <h2 className='mt-2 font-semibold'>
                  {t('dev.connectedAccountsTitle', {
                    defaultValue: 'Connected accounts',
                  })}
                </h2>
                <p className='mt-1 max-w-xl text-sm leading-6 text-muted-foreground'>
                  {t('dev.connectedAccountsDescription', {
                    defaultValue:
                      'Manage the mail accounts connected by the current user.',
                  })}
                </p>
              </div>
              <span className='inline-flex h-7 min-w-7 items-center justify-center rounded-full border bg-background px-2 text-xs font-semibold'>
                {accounts.length}
              </span>
            </div>

            {loading ? (
              <div className='p-6'>
                <LoadingState
                  label={t('settings.loading', {
                    defaultValue: 'Loading mail configuration…',
                  })}
                />
              </div>
            ) : accounts.length === 0 ? (
              <div className='p-6'>
                <EmptyState
                  description={t('dev.connectedAccountsEmptyDescription', {
                    defaultValue:
                      'Choose a configured account type above to connect your first mailbox.',
                  })}
                  title={t('settings.accounts.emptyTitle', {
                    defaultValue: 'No accounts connected',
                  })}
                />
              </div>
            ) : (
              <div className='divide-y'>
                {accounts.map((account) => {
                  const run = syncRuns[account.id];
                  return (
                    <div key={account.id}>
                      <ConnectedAccountRow
                        account={account}
                        defaultLabel={t('settings.accounts.default', {
                          defaultValue: 'Default',
                        })}
                        onSync={startSync}
                        onDefault={(account) =>
                          updateAccount(account, { isDefault: true })
                        }
                        onRemove={removeAccount}
                        onToggleStatus={(account) =>
                          updateAccount(account, {
                            status:
                              account.status === 'suspended'
                                ? 'active'
                                : 'suspended',
                          })
                        }
                        providerLabel={
                          providerLabels.get(providerKey(account.provider)) ??
                          account.provider.name
                        }
                        statusLabel={t(`status.account.${account.status}`, {
                          defaultValue: account.status,
                        })}
                        syncLabel={t('settings.accounts.sync', {
                          defaultValue: 'Sync mailbox',
                        })}
                        defaultActionLabel={t('settings.accounts.makeDefault', {
                          defaultValue: 'Make default',
                        })}
                        removeLabel={t('settings.accounts.remove', {
                          defaultValue: 'Disconnect',
                        })}
                        toggleStatusLabel={
                          account.status === 'suspended'
                            ? t('settings.accounts.resume', {
                                defaultValue: 'Resume',
                              })
                            : t('settings.accounts.suspend', {
                                defaultValue: 'Pause',
                              })
                        }
                        syncing={
                          syncing === account.id ||
                          (run !== undefined &&
                            ['pending', 'running'].includes(run.status))
                        }
                      />
                      {(accountIdentities[account.id] ?? []).length > 0 ? (
                        <div className='mx-6 mb-5 space-y-3 rounded-xl border bg-muted/10 p-4'>
                          <h4 className='text-sm font-semibold'>
                            {t('settings.identities.title', {
                              defaultValue: 'Sending identities and signatures',
                            })}
                          </h4>
                          {(accountIdentities[account.id] ?? []).map(
                            (identity) => (
                              <div className='space-y-2' key={identity.id}>
                                <div className='flex items-center gap-2 text-sm'>
                                  <span className='font-medium'>
                                    {identity.address}
                                  </span>
                                  {identity.isPrimary ? (
                                    <MailStatusBadge
                                      label={t('settings.identities.primary', {
                                        defaultValue: 'Primary',
                                      })}
                                      tone='info'
                                    />
                                  ) : null}
                                </div>
                                <MailSignatureManager
                                  identity={identity}
                                  onError={setError}
                                />
                              </div>
                            ),
                          )}
                        </div>
                      ) : null}
                      {run ? <SyncProgress run={run} /> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </MailDevPageShell>
  );
}

function ConnectedAccountRow({
  account,
  defaultLabel,
  onSync,
  onDefault,
  onRemove,
  onToggleStatus,
  providerLabel,
  statusLabel,
  syncLabel,
  syncing,
  defaultActionLabel,
  removeLabel,
  toggleStatusLabel,
}: {
  readonly account: MailAccountView;
  readonly defaultLabel: string;
  readonly onSync: (account: MailAccountView) => void;
  readonly onDefault: (account: MailAccountView) => void;
  readonly onRemove: (account: MailAccountView) => void;
  readonly onToggleStatus: (account: MailAccountView) => void;
  readonly providerLabel: string;
  readonly statusLabel: string;
  readonly syncLabel: string;
  readonly syncing: boolean;
  readonly defaultActionLabel: string;
  readonly removeLabel: string;
  readonly toggleStatusLabel: string;
}): ReactElement {
  return (
    <div className='flex flex-col gap-4 px-6 py-5 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center'>
      <span className='grid size-11 shrink-0 place-items-center rounded-xl border bg-muted/30 text-muted-foreground'>
        <Mail aria-hidden='true' className='size-5' />
      </span>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <h3 className='truncate font-semibold'>{account.address}</h3>
          <MailStatusBadge
            label={statusLabel}
            tone={accountStatusTone(account.status)}
          />
          {account.isDefault ? (
            <MailStatusBadge label={defaultLabel} tone='info' />
          ) : null}
        </div>
        <p className='mt-1 truncate text-sm text-muted-foreground'>
          {account.displayName ? `${account.displayName} · ` : ''}
          {providerLabel}
        </p>
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        <span className='rounded-md border bg-muted/20 px-2 py-1 font-mono text-[11px] text-muted-foreground'>
          {account.provider.type}
        </span>
        <Button
          disabled={syncing || account.status !== 'active'}
          onClick={() => onSync(account)}
          type='button'
        >
          <RefreshCw
            aria-hidden='true'
            className={`size-4 ${syncing ? 'animate-spin' : ''}`}
          />
          {syncLabel}
        </Button>
        {!account.isDefault ? (
          <Button
            onClick={() => onDefault(account)}
            type='button'
            variant='outline'
          >
            {defaultActionLabel}
          </Button>
        ) : null}
        <Button
          disabled={syncing}
          onClick={() => onToggleStatus(account)}
          type='button'
          variant='outline'
        >
          {toggleStatusLabel}
        </Button>
        <Button
          disabled={syncing}
          onClick={() => onRemove(account)}
          type='button'
          variant='destructive'
        >
          {removeLabel}
        </Button>
      </div>
    </div>
  );
}

function SyncProgress({
  run,
}: {
  readonly run: MailSyncRunView;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='mx-6 mb-5 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-4 py-3 text-sm'>
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

function accountStatusTone(status: MailAccountView['status']): MailStatusTone {
  if (status === 'active') return 'success';
  if (status === 'connecting') return 'info';
  if (status === 'reauthorizationRequired') return 'warning';
  return 'danger';
}

function syncStatusTone(status: MailSyncRunView['status']): MailStatusTone {
  if (status === 'completed') return 'success';
  if (status === 'failed' || status === 'cancelled') return 'danger';
  return 'info';
}

function LoadingState({ label }: { readonly label: string }): ReactElement {
  return (
    <div className='rounded-xl border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground'>
      {label}
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
    <div className='rounded-xl border border-dashed bg-muted/20 p-8 text-center'>
      <p className='font-medium'>{title}</p>
      <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
    </div>
  );
}

function providerKey(
  provider: Pick<MailProviderView, 'type' | 'name'>,
): string {
  return `${provider.type}:${provider.name}`;
}

function readAuthorizationNotice(): 'success' | 'failure' | undefined {
  const value = new URL(window.location.href).searchParams.get(
    'mailAuthorization',
  );
  return value === 'success' || value === 'failure' ? value : undefined;
}

function dateDaysAgo(days: number): string {
  const value = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return value.toISOString().slice(0, 10);
}
