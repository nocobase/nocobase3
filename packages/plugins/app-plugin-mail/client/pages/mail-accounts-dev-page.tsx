import { FileText, Link2, Mail, RefreshCw } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import {
  MailAccountConnector,
  MailDevPageShell,
  MailStatusBadge,
  MailSyncPolicyFields,
  MailSignatureManager,
  MailTemplateManager,
  type MailSyncPolicyValue,
  type MailStatusTone,
  type MailAccountCredentials,
} from '../components/index.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.js';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet.js';
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
  }));
  const [showConnector, setShowConnector] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [accountToRemove, setAccountToRemove] = useState<MailAccountView>();
  const [removingAccountId, setRemovingAccountId] = useState<string>();
  const [signatureAccountId, setSignatureAccountId] = useState<string>();
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
  const signatureAccount = accounts.find(
    (account) => account.id === signatureAccountId,
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

  const requestRemoveAccount = (account: MailAccountView): void => {
    setError(undefined);
    setAccountToRemove(account);
  };

  const confirmRemoveAccount = (): void => {
    const account = accountToRemove;
    if (!account) return;

    setRemovingAccountId(account.id);
    setError(undefined);
    void mail.removeAccount(account.id).then(
      () => {
        setRemovingAccountId(undefined);
        setAccountToRemove(undefined);
        refresh();
      },
      (cause: unknown) => {
        setRemovingAccountId(undefined);
        setError(
          mailErrorMessage(
            cause,
            t('errors.requestFailed', { defaultValue: 'Mail request failed.' }),
          ),
        );
      },
    );
  };

  return (
    <MailDevPageShell
      actions={
        <>
          <Button
            onClick={() => {
              setShowConnector(true);
              setShowTemplates(false);
            }}
            type='button'
            variant={showConnector ? 'default' : 'outline'}
          >
            <Link2 aria-hidden='true' className='size-4' />
            {t('dev.associateAccount', {
              defaultValue: 'Associate account',
            })}
          </Button>
          <Button
            onClick={() => {
              setShowTemplates((current) => !current);
              setShowConnector(false);
            }}
            type='button'
            variant={showTemplates ? 'default' : 'outline'}
          >
            <FileText aria-hidden='true' className='size-4' />
            {t('dev.templateManagement', {
              defaultValue: showTemplates ? 'Close templates' : 'Templates',
            })}
          </Button>
          <Button disabled={loading} onClick={refresh} variant='outline'>
            <RefreshCw
              aria-hidden='true'
              className={`size-4 ${loading ? 'animate-spin' : ''}`}
            />
            {t('actions.refresh', { defaultValue: 'Refresh' })}
          </Button>
        </>
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
              <p className='mt-1 max-w-2xl text-sm leading-6 text-muted-foreground'>
                {t('dev.connectedAccountsDescription', {
                  defaultValue:
                    'Manage and synchronize the mail accounts connected by the current user.',
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
                    'Use Associate account to connect your first mailbox.',
                })}
                title={t('settings.accounts.emptyTitle', {
                  defaultValue: 'No accounts connected',
                })}
              />
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='min-w-[60rem] w-full text-left text-sm'>
                <thead className='bg-muted/20 text-xs text-muted-foreground'>
                  <tr>
                    <th className='px-4 py-3 font-medium'>
                      {t('dev.accountColumn', { defaultValue: 'Account' })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('dev.providerColumn', { defaultValue: 'Provider' })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('dev.statusColumn', { defaultValue: 'Status' })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('dev.defaultColumn', { defaultValue: 'Default' })}
                    </th>
                    <th className='px-4 py-3 text-right font-medium'>
                      {t('dev.actionsColumn', { defaultValue: 'Actions' })}
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y'>
                  {accounts.map((account) => {
                    const run = syncRuns[account.id];
                    const signaturesOpen = signatureAccountId === account.id;
                    return (
                      <Fragment key={account.id}>
                        <ConnectedAccountRow
                          account={account}
                          defaultLabel={t('settings.accounts.default', {
                            defaultValue: 'Default',
                          })}
                          onSync={startSync}
                          onDefault={(account) =>
                            updateAccount(account, { isDefault: true })
                          }
                          onRemove={requestRemoveAccount}
                          onToggleSignatures={(account) => {
                            setShowConnector(false);
                            setShowTemplates(false);
                            setError(undefined);
                            setSignatureAccountId((current) =>
                              current === account.id ? undefined : account.id,
                            );
                          }}
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
                          signaturesOpen={signaturesOpen}
                          signaturesLabel={t('dev.manageSignatures', {
                            defaultValue: 'Signatures',
                          })}
                          statusLabel={t(`status.account.${account.status}`, {
                            defaultValue: account.status,
                          })}
                          syncLabel={t('settings.accounts.sync', {
                            defaultValue: 'Sync',
                          })}
                          defaultActionLabel={t(
                            'settings.accounts.makeDefault',
                            { defaultValue: 'Make default' },
                          )}
                          removeLabel={
                            removingAccountId === account.id
                              ? t('settings.accounts.removing', {
                                  defaultValue: 'Removing…',
                                })
                              : t('settings.accounts.remove', {
                                  defaultValue: 'Remove account',
                                })
                          }
                          toggleStatusLabel={
                            account.status === 'suspended'
                              ? t('settings.accounts.activate', {
                                  defaultValue: 'Activate',
                                })
                              : t('settings.accounts.deactivate', {
                                  defaultValue: 'Deactivate',
                                })
                          }
                          removing={removingAccountId === account.id}
                          syncing={
                            syncing === account.id ||
                            (run !== undefined &&
                              ['pending', 'running'].includes(run.status))
                          }
                        />
                        {run ? (
                          <tr>
                            <td className='px-6 py-3' colSpan={5}>
                              <SyncProgress run={run} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Sheet open={showConnector} onOpenChange={setShowConnector}>
        <SheetContent
          className='overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl'
          closeLabel={t('dev.closePanel', { defaultValue: 'Close' })}
          side='right'
        >
          <SheetHeader className='border-b bg-muted/20 pr-14'>
            <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
              {t('dev.accountConnectionStep', {
                defaultValue: 'Account connection',
              })}
            </p>
            <SheetTitle className='mt-2'>
              {t('settings.providers.title', {
                defaultValue: 'Add mail account',
              })}
            </SheetTitle>
            <SheetDescription>
              {t('settings.providers.description', {
                defaultValue:
                  'Choose an account type, then authorize it or enter its mailbox credentials.',
              })}
            </SheetDescription>
          </SheetHeader>

          <div className='space-y-6 px-4 pb-6'>
            <section className='space-y-4 pt-2'>
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
                      defaultValue: 'Connecting…',
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
                    configurationRequired: t(
                      'settings.providers.configurationRequired',
                      {
                        defaultValue: 'Configure under mail.providers first',
                      },
                    ),
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
            </section>

            <section className='space-y-4 border-t pt-6'>
              <div>
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
                      'Choose the date for the next initial mailbox sync. Page size is managed by the server configuration.',
                  })}
                </p>
              </div>
              <MailSyncPolicyFields
                labels={{
                  receivedAfter: t('settings.initialSync.receivedAfter', {
                    defaultValue: 'Import messages received after',
                  }),
                }}
                onChange={setPolicy}
                value={policy}
              />
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showTemplates} onOpenChange={setShowTemplates}>
        <SheetContent
          className='overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-4xl'
          closeLabel={t('dev.closePanel', { defaultValue: 'Close' })}
          side='right'
        >
          <SheetHeader className='border-b bg-muted/20 pr-14'>
            <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
              {t('dev.templateManagementCategory', {
                defaultValue: 'Reusable content',
              })}
            </p>
            <SheetTitle className='mt-2'>
              {t('dev.templateManagementTitle', {
                defaultValue: 'Template management',
              })}
            </SheetTitle>
            <SheetDescription>
              {t('dev.templateManagementDescription', {
                defaultValue:
                  'Create reusable subjects and message bodies without leaving the account workspace.',
              })}
            </SheetDescription>
          </SheetHeader>
          <div className='min-w-0 p-4 pb-6'>
            <MailTemplateManager />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={signatureAccount !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setSignatureAccountId(undefined);
            setError(undefined);
          }
        }}
      >
        <SheetContent
          className='overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl'
          closeLabel={t('dev.closePanel', { defaultValue: 'Close' })}
          side='right'
        >
          <SheetHeader className='border-b bg-muted/20 pr-14'>
            <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
              {t('dev.signatureManagementCategory', {
                defaultValue: 'Account settings',
              })}
            </p>
            <SheetTitle className='mt-2'>
              {t('dev.signatureManagementTitle', {
                defaultValue: 'Signature management',
              })}
            </SheetTitle>
            <SheetDescription>
              {t('dev.signatureManagementDescription', {
                defaultValue:
                  'Manage sending identities and signatures for this connected account.',
              })}
            </SheetDescription>
          </SheetHeader>

          {signatureAccount ? (
            <div className='space-y-5 px-4 pb-6'>
              <div className='rounded-xl border bg-muted/20 p-4'>
                <p className='font-semibold'>{signatureAccount.address}</p>
                {signatureAccount.displayName ? (
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {signatureAccount.displayName}
                  </p>
                ) : null}
              </div>

              {error ? (
                <div className='rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'>
                  {error}
                </div>
              ) : null}

              {(accountIdentities[signatureAccount.id] ?? []).length === 0 ? (
                <p className='rounded-xl border border-dashed p-5 text-sm text-muted-foreground'>
                  {t('dev.noIdentities', {
                    defaultValue:
                      'No sending identities are available for this account.',
                  })}
                </p>
              ) : (
                (accountIdentities[signatureAccount.id] ?? []).map(
                  (identity) => (
                    <section
                      className='space-y-3 rounded-xl border bg-background p-4'
                      key={identity.id}
                    >
                      <div className='flex items-center gap-2 text-sm'>
                        <span className='font-medium'>{identity.address}</span>
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
                    </section>
                  ),
                )
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={accountToRemove !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setAccountToRemove(undefined);
            setError(undefined);
          }
        }}
      >
        <DialogContent
          closeLabel={t('dev.closePanel', { defaultValue: 'Close' })}
        >
          <DialogHeader>
            <DialogTitle>
              {t('settings.accounts.removeTitle', {
                defaultValue: 'Remove mail account?',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('settings.accounts.removeDescription', {
                defaultValue:
                  'This will delete synchronized mail, folders, signatures, sync records, and authorization data stored in this app. It will not delete mail from your provider.',
              })}
            </DialogDescription>
          </DialogHeader>

          {accountToRemove ? (
            <div className='mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm'>
              <p className='font-medium'>{accountToRemove.address}</p>
              <p className='mt-1 text-muted-foreground'>
                {t('settings.accounts.removeLocalDataNotice', {
                  defaultValue:
                    'Only this application’s local account data will be removed.',
                })}
              </p>
            </div>
          ) : null}

          {error ? (
            <p className='mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'>
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              disabled={removingAccountId !== undefined}
              onClick={() => setAccountToRemove(undefined)}
              type='button'
              variant='outline'
            >
              {t('settings.accounts.removeCancel', {
                defaultValue: 'Cancel',
              })}
            </Button>
            <Button
              disabled={removingAccountId !== undefined}
              onClick={confirmRemoveAccount}
              type='button'
              variant='destructive'
            >
              {removingAccountId !== undefined
                ? t('settings.accounts.removing', {
                    defaultValue: 'Removing…',
                  })
                : t('settings.accounts.removeConfirm', {
                    defaultValue: 'Remove account',
                  })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MailDevPageShell>
  );
}

function ConnectedAccountRow({
  account,
  defaultLabel,
  onSync,
  onDefault,
  onRemove,
  onToggleSignatures,
  onToggleStatus,
  providerLabel,
  signaturesLabel,
  signaturesOpen,
  statusLabel,
  syncLabel,
  syncing,
  defaultActionLabel,
  removeLabel,
  removing,
  toggleStatusLabel,
}: {
  readonly account: MailAccountView;
  readonly defaultLabel: string;
  readonly onSync: (account: MailAccountView) => void;
  readonly onDefault: (account: MailAccountView) => void;
  readonly onRemove: (account: MailAccountView) => void;
  readonly onToggleSignatures: (account: MailAccountView) => void;
  readonly onToggleStatus: (account: MailAccountView) => void;
  readonly providerLabel: string;
  readonly signaturesLabel: string;
  readonly signaturesOpen: boolean;
  readonly statusLabel: string;
  readonly syncLabel: string;
  readonly syncing: boolean;
  readonly defaultActionLabel: string;
  readonly removeLabel: string;
  readonly removing: boolean;
  readonly toggleStatusLabel: string;
}): ReactElement {
  return (
    <tr className='transition-colors hover:bg-muted/20'>
      <td className='px-4 py-4'>
        <div className='flex min-w-64 items-center gap-3'>
          <span className='grid size-10 shrink-0 place-items-center rounded-xl border bg-muted/30 text-muted-foreground'>
            <Mail aria-hidden='true' className='size-5' />
          </span>
          <div className='min-w-0'>
            <p className='truncate font-semibold'>{account.address}</p>
            {account.displayName ? (
              <p className='truncate text-xs text-muted-foreground'>
                {account.displayName}
              </p>
            ) : null}
          </div>
        </div>
      </td>
      <td className='px-4 py-4'>
        <div className='min-w-32'>
          <p className='font-medium'>{providerLabel}</p>
          <p className='mt-1 font-mono text-[11px] text-muted-foreground'>
            {account.provider.type}
          </p>
        </div>
      </td>
      <td className='px-4 py-4'>
        <MailStatusBadge
          label={statusLabel}
          tone={accountStatusTone(account.status)}
        />
      </td>
      <td className='px-4 py-4'>
        {account.isDefault ? (
          <MailStatusBadge label={defaultLabel} tone='info' />
        ) : (
          <span className='text-muted-foreground'>—</span>
        )}
      </td>
      <td className='px-4 py-4'>
        <div className='flex min-w-max justify-end gap-2'>
          <Button
            aria-expanded={signaturesOpen}
            onClick={() => onToggleSignatures(account)}
            type='button'
            variant='outline'
          >
            {signaturesLabel}
          </Button>
          <Button
            disabled={syncing || account.status !== 'active'}
            onClick={() => onSync(account)}
            type='button'
            variant='outline'
          >
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
            disabled={syncing || removing}
            onClick={() => onToggleStatus(account)}
            type='button'
            variant='outline'
          >
            {toggleStatusLabel}
          </Button>
          <Button
            disabled={syncing || removing}
            onClick={() => onRemove(account)}
            type='button'
            variant='destructive'
          >
            {removeLabel}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function SyncProgress({
  run,
}: {
  readonly run: MailSyncRunView;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-4 py-3 text-sm'>
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
