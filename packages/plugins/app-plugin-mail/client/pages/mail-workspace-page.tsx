import {
  EMPTY_COMPOSER,
  type ComposerState,
} from '../lib/mail-composer-state.js';
import {
  ArrowLeft,
  Inbox,
  Menu,
  PenLine,
  RefreshCw,
  Search,
  Settings2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { resolveAppUrl } from '@nocobase/app-client';
import {
  MailComposer,
  type MailComposerRequest,
} from '../components/mail-composer.js';

import {
  MailboxSidebar,
  MailConversationView,
  MailMessageList,
  MAIL_UNREAD_COUNT_CHANGED_EVENT,
  type MailboxSmartView,
} from '../components/index.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import {
  plainTextToMailHtml,
  type MailTemplateVariables,
} from '../lib/mail-template.js';
import { mergeMailFolders } from '../lib/mail-folders.js';
import {
  mailErrorMessage,
  type MailAccountView,
  type MailClient,
  type MailFolder,
  type MailLabel,
  type MailMessage,
  type MailMessageSummary,
  type MailProviderCapabilities,
  type MailProviderView,
  type MailSyncRunView,
} from '../mail-client.js';
import { useMailClient } from '../runtime.js';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet.js';
import { cn } from '../lib/utils.js';
import { MAIL_PLUGIN_NS } from '../namespace.js';

export interface MailWorkspacePageProps {
  /** Values available to `{{path.to.value}}` placeholders in mail templates. */
  readonly templateVariables?: MailTemplateVariables;
}

const LAST_COMPOSE_ACCOUNT_KEY_PREFIX =
  'nocobase:mail:last-compose-account:v1:';

export default function MailWorkspacePage({
  templateVariables = {},
}: MailWorkspacePageProps = {}): ReactElement {
  const { t } = useTranslation(MAIL_PLUGIN_NS);
  const mail = useMailClient();
  const [accounts, setAccounts] = useState<readonly MailAccountView[]>([]);
  const [providers, setProviders] = useState<readonly MailProviderView[]>([]);
  const [accountId, setAccountId] = useState('');
  const [folders, setFolders] = useState<readonly MailFolder[]>([]);
  const [foldersByAccountId, setFoldersByAccountId] = useState<
    ReadonlyMap<string, readonly MailFolder[]>
  >(() => new Map());
  const [folderId, setFolderId] = useState<string>();
  const [customLabels, setCustomLabels] = useState<readonly MailLabel[]>([]);
  const [labelId, setLabelId] = useState<string>();
  const [smartView, setSmartView] = useState<MailboxSmartView>('all');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<readonly MailMessageSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [selected, setSelected] = useState<MailMessageSummary>();
  const [conversation, setConversation] = useState<readonly MailMessage[]>([]);
  const [conversationCursor, setConversationCursor] = useState<string>();
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [syncRuns, setSyncRuns] = useState<
    Readonly<Record<string, MailSyncRunView>>
  >({});
  const syncRunsRef = useRef<Readonly<Record<string, MailSyncRunView>>>({});
  const syncPollInFlightRef = useRef(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [reloadVersion, setReloadVersion] = useState(0);
  const conversationRequestIdRef = useRef(0);
  const messageRequestIdRef = useRef(0);
  const accountIdRef = useRef('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [composeAccountId, setComposeAccountId] = useState('');
  const [composerRequest, setComposerRequest] = useState<MailComposerRequest>();

  useEffect(() => {
    syncRunsRef.current = syncRuns;
  }, [syncRuns]);

  const requestError = useCallback(
    (cause: unknown): void => {
      setError(
        mailErrorMessage(
          cause,
          t('errors.requestFailed', { defaultValue: 'Mail request failed.' }),
        ),
      );
    },
    [t],
  );

  const currentAccount = accounts.find((account) => account.id === accountId);
  const currentProviderCapabilities = findProviderCapabilities(
    currentAccount,
    providers,
  );
  const composeAccount = accounts.find(
    (account) => account.id === composeAccountId,
  );
  const composeProviderCapabilities = findProviderCapabilities(
    composeAccount,
    providers,
  );
  const selectedMessageAccount = selected
    ? accounts.find((account) => account.id === selected.accountId)
    : undefined;
  const selectedMessageProviderCapabilities = findProviderCapabilities(
    selectedMessageAccount,
    providers,
  );
  const syncableAccounts = accounts.filter((account) => {
    const capabilities = findProviderCapabilities(account, providers);
    return account.status === 'active' && capabilities?.incrementalSync;
  });
  const isAllAccounts = accountId === '';
  const canSend = Boolean(
    composeAccount?.status === 'active' && composeProviderCapabilities?.send,
  );
  const canSync = isAllAccounts
    ? syncableAccounts.length > 0
    : Boolean(
        currentAccount?.status === 'active' &&
        currentProviderCapabilities?.incrementalSync,
      );
  const selectedMessageCanMove = Boolean(
    selectedMessageAccount?.status === 'active' &&
    selectedMessageProviderCapabilities?.moveMessage &&
    [...(foldersByAccountId.get(selected?.accountId ?? '') ?? [])].some(
      (folder) => folder.type === 'archive',
    ),
  );
  const selectedMessageCanDraft = Boolean(
    selectedMessageAccount?.status === 'active' &&
    selectedMessageProviderCapabilities?.send,
  );
  const selectedMessageCanUseLabels =
    selectedMessageAccount?.status === 'active';
  const selectedMessageInTrash = Boolean(
    selected && isMessageInTrash(selected, foldersByAccountId),
  );

  const loadAccounts = useCallback(
    (clearError = true): void => {
      setLoadingAccounts(true);
      if (clearError) setError(undefined);
      void Promise.allSettled([
        mail.listAccounts(),
        mail.listProviders(),
        mail.listLabels(),
      ])
        .then(([accountsResult, providersResult, labelsResult]) => {
          if (accountsResult.status === 'rejected') {
            requestError(accountsResult.reason);
            return;
          }
          if (providersResult.status === 'rejected') {
            requestError(providersResult.reason);
          }
          if (labelsResult.status === 'rejected') {
            requestError(labelsResult.reason);
          }
          const nextAccounts = accountsResult.value;
          const nextProviders =
            providersResult.status === 'fulfilled' ? providersResult.value : [];
          const nextLabels =
            labelsResult.status === 'fulfilled' ? labelsResult.value : [];
          const nextAccountId = nextAccounts.some(
            (account) => account.id === accountIdRef.current,
          )
            ? accountIdRef.current
            : '';
          setProviders(nextProviders);
          setAccounts(nextAccounts);
          setCustomLabels(nextLabels);
          setComposeAccountId((current) => {
            if (nextAccounts.some((account) => account.id === current))
              return current;
            return resolveComposeAccountId(
              nextAccounts,
              nextProviders,
              readLastComposeAccountId(nextAccounts[0]?.userId),
            );
          });
          if (nextAccountId !== accountIdRef.current) {
            messageRequestIdRef.current += 1;
            conversationRequestIdRef.current += 1;
            accountIdRef.current = nextAccountId;
            setAccountId(nextAccountId);
            setFolders([]);
            setFolderId(undefined);
            setLabelId(undefined);
            setMessages([]);
            setNextCursor(undefined);
            setSelected(undefined);
            setConversation([]);
            setConversationCursor(undefined);
            setLoadingMessages(false);
            setLoadingConversation(false);
          }
        })
        .catch(requestError)
        .finally(() => setLoadingAccounts(false));
    },
    [mail, requestError],
  );

  useEffect(() => {
    void Promise.resolve().then(() => loadAccounts());
  }, [loadAccounts]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (syncPollInFlightRef.current) return;
      const activeRuns = Object.values(syncRunsRef.current).filter(
        isActiveSyncRun,
      );
      if (activeRuns.length === 0) return;
      syncPollInFlightRef.current = true;
      void Promise.all(
        activeRuns.map((run) =>
          mail.getSyncRun(run.id).catch((cause: unknown) => {
            if (syncRunsRef.current[run.accountId]?.id === run.id) {
              setSyncRuns((current) => {
                if (current[run.accountId]?.id !== run.id) return current;
                const next = { ...current };
                delete next[run.accountId];
                return next;
              });
              requestError(cause);
            }
            return undefined;
          }),
        ),
      )
        .then((nextRuns) => {
          const resolvedRuns = nextRuns.filter((run): run is MailSyncRunView =>
            Boolean(run),
          );
          const currentRuns = syncRunsRef.current;
          const currentResolvedRuns = resolvedRuns.filter(
            (run) => currentRuns[run.accountId]?.id === run.id,
          );
          setSyncRuns((current) => {
            const next = { ...current };
            let changed = false;
            for (const run of resolvedRuns) {
              if (current[run.accountId]?.id !== run.id) continue;
              changed = true;
              if (isActiveSyncRun(run)) next[run.accountId] = run;
              else delete next[run.accountId];
            }
            return changed ? next : current;
          });
          const failedRuns = currentResolvedRuns.filter(
            (run) => run.status === 'failed' || run.status === 'cancelled',
          );
          if (failedRuns.length > 0) {
            const fallback = t('errors.syncFailed', {
              defaultValue: 'Could not synchronize the mailbox.',
            });
            setError(
              failedRuns[0].error?.code
                ? `${fallback} (${failedRuns[0].error.code})`
                : fallback,
            );
          }
          if (
            currentResolvedRuns.length === activeRuns.length &&
            currentResolvedRuns.every((run) => !isActiveSyncRun(run))
          ) {
            loadAccounts(false);
            setReloadVersion((version) => version + 1);
          }
        })
        .finally(() => {
          syncPollInFlightRef.current = false;
        });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [loadAccounts, mail, requestError, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const messageQuery = useMemo(
    () => ({
      accountId: accountId || undefined,
      folderId,
      labelId,
      query: debouncedQuery.trim() || undefined,
      unread: smartView === 'unread' ? true : undefined,
      starred: smartView === 'starred' ? true : undefined,
      limit: 50,
    }),
    [accountId, debouncedQuery, folderId, labelId, smartView],
  );

  useEffect(() => {
    const requestedAccountIds = accountId
      ? [accountId]
      : accounts.map((account) => account.id);
    let active = true;
    void Promise.allSettled(
      requestedAccountIds.map(async (requestedAccountId) => ({
        accountId: requestedAccountId,
        folders: await mail.listFolders(requestedAccountId),
      })),
    ).then((results) => {
      if (!active) return;
      const next = new Map<string, readonly MailFolder[]>();
      for (const result of results) {
        if (result.status === 'fulfilled') {
          next.set(result.value.accountId, result.value.folders);
        } else {
          requestError(result.reason);
        }
      }
      setFoldersByAccountId(next);
      setFolders(
        mergeMailFolders(
          accountId || '__all__',
          accountId ? (next.get(accountId) ?? []) : [],
          {
            inbox: t('workspace.defaultFolders.inbox', {
              defaultValue: 'Inbox',
            }),
            sent: t('workspace.defaultFolders.sent', {
              defaultValue: 'Sent',
            }),
            drafts: t('workspace.defaultFolders.drafts', {
              defaultValue: 'Drafts',
            }),
            trash: t('workspace.defaultFolders.trash', {
              defaultValue: 'Trash',
            }),
            junk: t('workspace.defaultFolders.junk', {
              defaultValue: 'Spam',
            }),
            archive: t('workspace.defaultFolders.archive', {
              defaultValue: 'Archive',
            }),
          },
        ),
      );
    });
    return () => {
      active = false;
    };
  }, [accountId, accounts, mail, reloadVersion, requestError, t]);

  useEffect(() => {
    if (accounts.length === 0) return;
    const requestId = messageRequestIdRef.current + 1;
    messageRequestIdRef.current = requestId;
    conversationRequestIdRef.current += 1;
    void Promise.resolve()
      .then(() => {
        if (messageRequestIdRef.current !== requestId) return undefined;
        setLoadingMessages(true);
        setLoadingConversation(false);
        setError(undefined);
        return mail.listMessages(messageQuery);
      })
      .then(
        (page) => {
          if (!page || messageRequestIdRef.current !== requestId) return;
          setMessages(page.items);
          setNextCursor(page.nextCursor);
          setSelected(undefined);
          setConversation([]);
          setConversationCursor(undefined);
          conversationRequestIdRef.current += 1;
          if (messageRequestIdRef.current === requestId)
            setLoadingMessages(false);
        },
        (cause: unknown) => {
          if (messageRequestIdRef.current !== requestId) return;
          requestError(cause);
          setLoadingMessages(false);
        },
      );
  }, [accountId, accounts, mail, messageQuery, reloadVersion, requestError]);

  const selectMessage = useCallback(
    (message: MailMessageSummary): void => {
      const requestId = conversationRequestIdRef.current + 1;
      conversationRequestIdRef.current = requestId;
      setSelected(message);
      setReading(true);
      setConversation([]);
      setConversationCursor(undefined);
      setLoadingConversation(true);
      setError(undefined);
      const request = message.conversationId
        ? mail.listConversationMessages(
            message.accountId,
            message.conversationId,
            { limit: 50 },
          )
        : mail
            .getMessage(message.accountId, message.id)
            .then((detail) => ({ items: [detail], nextCursor: undefined }));
      void request
        .then((page) => {
          if (conversationRequestIdRef.current !== requestId) return;
          setConversation(page.items);
          setConversationCursor(page.nextCursor);
        })
        .catch((cause: unknown) => {
          if (conversationRequestIdRef.current === requestId)
            requestError(cause);
        })
        .finally(() => {
          if (conversationRequestIdRef.current === requestId)
            setLoadingConversation(false);
        });
    },
    [mail, requestError],
  );

  const loadMoreMessages = (): void => {
    if (!nextCursor || loadingMessages) return;
    const requestId = messageRequestIdRef.current;
    setLoadingMessages(true);
    void mail
      .listMessages({ ...messageQuery, cursor: nextCursor })
      .then((page) => {
        if (messageRequestIdRef.current !== requestId) return;
        setMessages((current) => [...current, ...page.items]);
        setNextCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (messageRequestIdRef.current === requestId) requestError(cause);
      })
      .finally(() => {
        if (messageRequestIdRef.current === requestId)
          setLoadingMessages(false);
      });
  };

  const loadMoreConversation = (): void => {
    if (!selected?.conversationId || !conversationCursor || loadingConversation)
      return;
    const requestId = conversationRequestIdRef.current;
    const { accountId: selectedAccountId, conversationId } = selected;
    setLoadingConversation(true);
    void mail
      .listConversationMessages(selectedAccountId, conversationId, {
        cursor: conversationCursor,
        limit: 50,
      })
      .then((page) => {
        if (conversationRequestIdRef.current !== requestId) return;
        setConversation((current) => [...page.items, ...current]);
        setConversationCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (conversationRequestIdRef.current === requestId) requestError(cause);
      })
      .finally(() => {
        if (conversationRequestIdRef.current === requestId)
          setLoadingConversation(false);
      });
  };

  const rememberComposeAccount = useCallback(
    (nextAccountId: string): void => {
      const account = accounts.find((item) => item.id === nextAccountId);
      if (!account) return;
      setComposeAccountId(account.id);
      writeLastComposeAccountId(account);
    },
    [accounts],
  );

  const startSync = (): void => {
    if (!canSync || Object.values(syncRuns).some(isActiveSyncRun)) return;
    const targetAccounts = accountId
      ? currentAccount && canSync
        ? [currentAccount]
        : []
      : syncableAccounts;
    if (targetAccounts.length === 0) return;
    setError(undefined);
    void Promise.allSettled(
      targetAccounts.map((account) =>
        mail.startSync({ accountId: account.id }),
      ),
    ).then((results) => {
      const started = results.filter(
        (result): result is PromiseFulfilledResult<MailSyncRunView> =>
          result.status === 'fulfilled',
      );
      if (started.length > 0) {
        setSyncRuns((current) => ({
          ...current,
          ...Object.fromEntries(
            started.map(({ value }) => [value.accountId, value]),
          ),
        }));
      }
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length > 0) {
        const fallback = t('errors.syncFailed', {
          defaultValue: 'Could not synchronize the mailbox.',
        });
        setError(
          failed.length === targetAccounts.length
            ? fallback
            : `${fallback} (${failed.length} account${failed.length === 1 ? '' : 's'} failed)`,
        );
      }
      if (
        started.length > 0 &&
        started.every(({ value }) => !isActiveSyncRun(value))
      ) {
        loadAccounts(false);
        setReloadVersion((version) => version + 1);
      }
    });
  };

  const updateVisibleMessage = (updated: MailMessage): void => {
    setConversation((current) =>
      current.map((message) => (message.id === updated.id ? updated : message)),
    );
    setMessages((current) =>
      current.map((message) =>
        message.id === updated.id
          ? { ...updated, subjectCount: message.subjectCount }
          : message,
      ),
    );
    setSelected((current) => (current?.id === updated.id ? updated : current));
  };

  const mutateMessage = (
    operation: Promise<MailMessage | void>,
    removeMessage = false,
  ): void => {
    setError(undefined);
    void operation.then((updated) => {
      if (updated) {
        updateVisibleMessage(updated);
        window.dispatchEvent(new Event(MAIL_UNREAD_COUNT_CHANGED_EVENT));
      }
      if (removeMessage) {
        setSelected(undefined);
        setConversation([]);
        setReloadVersion((version) => version + 1);
      }
    }, requestError);
  };

  const openComposer = (
    value: ComposerState,
    attachments: MailMessage['attachments'] = [],
    preferredAccountId = composeAccountId,
  ): void => {
    if (
      composerRequest ||
      !accounts.some((account) => account.id === preferredAccountId)
    )
      return;
    rememberComposeAccount(preferredAccountId);
    setComposerRequest({ value, attachments, accountId: preferredAccountId });
  };

  const deleteWorkspaceMessage = (message: MailMessage): void => {
    const permanently = isMessageInTrash(message, foldersByAccountId);
    if (
      permanently &&
      !window.confirm(
        t('workspace.permanentlyDeleteConfirm', {
          defaultValue:
            'Permanently delete this message? This action cannot be undone.',
        }),
      )
    ) {
      return;
    }
    mutateMessage(
      mail.deleteMessage(message.accountId, message.id, permanently),
      true,
    );
  };

  const syncing = Object.values(syncRuns).some(isActiveSyncRun);
  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.address])),
    [accounts],
  );
  const syncLabel = isAllAccounts
    ? t('workspace.syncAll', { defaultValue: 'Sync all mailboxes' })
    : t('workspace.incrementalRefresh', { defaultValue: 'Sync mailbox' });

  const mailboxNavigation = (
    <MailboxSidebar
      accountId={accountId}
      accounts={accounts}
      customLabels={customLabels}
      folderId={folderId}
      folders={folders}
      labelId={labelId}
      labels={{
        account: t('dev.account', { defaultValue: 'Account' }),
        allAccounts: t('workspace.allAccounts', {
          defaultValue: 'All accounts',
        }),
        allMail: t('workspace.allMail', { defaultValue: 'All mail' }),
        unread: t('workspace.unreadOnly', { defaultValue: 'Unread' }),
        starred: t('workspace.starredOnly', { defaultValue: 'Starred' }),
        folders: t('workspace.folders', { defaultValue: 'Folders' }),
        labels: t('workspace.labels', { defaultValue: 'Labels' }),
      }}
      onAccountChange={(value) => {
        setNavigationOpen(false);
        setReading(false);
        if (value === accountId) return;
        messageRequestIdRef.current += 1;
        conversationRequestIdRef.current += 1;
        accountIdRef.current = value;
        setAccountId(value);
        if (value) rememberComposeAccount(value);
        setFolders([]);
        setFolderId(undefined);
        setLabelId(undefined);
        setSmartView('all');
      }}
      onFolderChange={(value) => {
        setNavigationOpen(false);
        setReading(false);
        if (value === folderId) return;
        messageRequestIdRef.current += 1;
        conversationRequestIdRef.current += 1;
        setFolderId(value);
      }}
      onLabelChange={(value) => {
        setNavigationOpen(false);
        setReading(false);
        if (value === labelId) return;
        messageRequestIdRef.current += 1;
        conversationRequestIdRef.current += 1;
        setLabelId(value);
      }}
      onSmartViewChange={(value) => {
        setNavigationOpen(false);
        setReading(false);
        if (value === smartView) return;
        messageRequestIdRef.current += 1;
        conversationRequestIdRef.current += 1;
        setSmartView(value);
        setFolderId(undefined);
        setLabelId(undefined);
      }}
      smartView={smartView}
    />
  );
  const viewTitle =
    folders.find((folder) => folder.providerFolderId === folderId)?.name ??
    customLabels.find((label) => label.id === labelId)?.name ??
    (smartView === 'unread'
      ? t('workspace.unreadOnly', { defaultValue: 'Unread' })
      : smartView === 'starred'
        ? t('workspace.starredOnly', { defaultValue: 'Starred' })
        : t('workspace.allMail', { defaultValue: 'All mail' }));
  return (
    <section className='@container/mail flex h-full min-h-[38rem] min-w-0 flex-col bg-background'>
      <header className='flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3'>
        <Button
          aria-label={t('workspace.mailboxNavigation', {
            defaultValue: 'Mailbox navigation',
          })}
          className='size-9 px-0 @5xl/mail:hidden'
          variant='ghost'
          onClick={() => setNavigationOpen(true)}
        >
          <Menu className='size-4' />
        </Button>
        <h1 className='mr-auto text-lg font-semibold'>
          {t('workspace.title', { defaultValue: 'Mail' })}
        </h1>
        <label className='relative order-last w-full min-w-0 @3xl/mail:order-none @3xl/mail:w-64'>
          <Search
            aria-hidden='true'
            className='absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
          />
          <Input
            aria-label={t('workspace.search', { defaultValue: 'Search mail' })}
            className='pl-9'
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('workspace.search', { defaultValue: 'Search mail' })}
            value={query}
          />
        </label>
        <div className='flex flex-wrap items-center justify-end gap-2'>
          <Button
            aria-label={t('nav.myAccounts', { defaultValue: 'My mailboxes' })}
            render={<a href={resolveAppUrl('/settings/mail/my-accounts')} />}
            nativeButton={false}
            role='link'
            variant='ghost'
            className='size-9 px-0'
          >
            <Settings2 aria-hidden='true' className='size-4' />
          </Button>
          <Button
            disabled={!canSend || Boolean(composerRequest)}
            onClick={() => openComposer(EMPTY_COMPOSER)}
          >
            <PenLine aria-hidden='true' className='size-4' />
            {t('workspace.compose', { defaultValue: 'Compose' })}
          </Button>
          <Button
            aria-label={syncLabel}
            disabled={
              !canSync ||
              syncing ||
              loadingAccounts ||
              loadingMessages ||
              loadingConversation
            }
            onClick={startSync}
            variant='outline'
          >
            <RefreshCw
              aria-hidden='true'
              className={`size-4 ${syncing ? 'animate-spin' : ''}`}
            />
            <span className='hidden @xl/mail:inline'>
              {syncing
                ? t('workspace.syncing', { defaultValue: 'Synchronizing…' })
                : syncLabel}
            </span>
          </Button>
        </div>
      </header>

      {error ? (
        <div
          role='alert'
          className='flex items-center gap-3 border-b bg-destructive/5 px-4 py-2 text-sm text-destructive'
        >
          <span className='flex-1'>{error}</span>
          <Button
            onClick={() => {
              loadAccounts();
              setReloadVersion((version) => version + 1);
            }}
            variant='ghost'
          >
            {t('workspace.retry', { defaultValue: 'Try again' })}
          </Button>
        </div>
      ) : null}

      {notice ? (
        <div
          role='status'
          className='flex items-center gap-3 border-b bg-primary/5 px-4 py-2 text-sm'
        >
          <span className='flex-1'>{notice}</span>
          <Button variant='ghost' onClick={() => setNotice(undefined)}>
            {t('workspace.dismiss', { defaultValue: 'Dismiss' })}
          </Button>
        </div>
      ) : null}
      {loadingAccounts && accounts.length === 0 ? (
        <div
          role='status'
          className='flex min-h-64 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground'
        >
          <RefreshCw aria-hidden='true' className='size-4 animate-spin' />
          {t('workspace.loading', { defaultValue: 'Loading messages…' })}
        </div>
      ) : accounts.length === 0 ? (
        <div className='grid flex-1 place-items-center p-8'>
          <div className='max-w-md space-y-4 text-center'>
            <span className='mx-auto grid size-14 place-items-center rounded-2xl bg-muted'>
              <Inbox
                aria-hidden='true'
                className='size-6 text-muted-foreground'
              />
            </span>
            <div>
              <h2 className='text-lg font-semibold text-foreground'>
                {t('workspace.noAccountsTitle', {
                  defaultValue: 'Connect your first mailbox',
                })}
              </h2>
              <p className='mt-2 text-sm leading-6 text-muted-foreground'>
                {t('workspace.noAccounts', {
                  defaultValue:
                    'Connect a mail account to sync messages, search conversations, and send from this workspace.',
                })}
              </p>
            </div>
            <Button
              render={<a href={resolveAppUrl('/settings/mail/my-accounts')} />}
              nativeButton={false}
              role='link'
            >
              <PenLine aria-hidden='true' className='size-4' />
              {t('workspace.connectAccount', {
                defaultValue: 'Connect mail account',
              })}
            </Button>
          </div>
        </div>
      ) : (
        <div className='grid min-h-0 flex-1 grid-cols-1 overflow-hidden @3xl/mail:grid-cols-[20rem_minmax(0,1fr)] @5xl/mail:grid-cols-[13rem_20rem_minmax(0,1fr)]'>
          <div className='hidden min-h-0 @5xl/mail:block'>
            {mailboxNavigation}
          </div>
          <div
            className={cn(
              'min-h-0 flex-col border-r @3xl/mail:flex',
              reading && selected ? 'hidden' : 'flex',
            )}
          >
            <div className='flex shrink-0 items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3'>
              <h2 className='truncate text-sm font-semibold'>{viewTitle}</h2>
              <span className='text-xs tabular-nums text-muted-foreground'>
                {t('workspace.loadedCount', {
                  count: messages.length,
                  defaultValue: '{{count}} loaded',
                })}
                {nextCursor ? '+' : ''}
              </span>
            </div>
            <MailMessageList
              accountNames={accountNames}
              availableLabels={selectedMessageCanUseLabels ? customLabels : []}
              labels={{
                loading: t('workspace.loading', {
                  defaultValue: 'Loading messages…',
                }),
                messages: t('workspace.title', { defaultValue: 'Mail' }),
                empty: t('workspace.empty', {
                  defaultValue: 'No messages match this mailbox view.',
                }),
                loadMore: t('workspace.loadMore', {
                  defaultValue: 'Load more',
                }),
                noSubject: t('workspace.noSubject', {
                  defaultValue: '(no subject)',
                }),
                subjectCount: (count) =>
                  t('workspace.subjectCount', {
                    count,
                    defaultValue: '{{count}} messages in this conversation',
                  }),
                unknownSender: t('workspace.unknownSender', {
                  defaultValue: 'Unknown sender',
                }),
              }}
              loading={loadingMessages}
              messages={messages}
              nextCursor={nextCursor}
              onLoadMore={loadMoreMessages}
              onSelect={selectMessage}
              showAccount={isAllAccounts}
              selectedMessageId={selected?.id}
            />
          </div>
          <div
            className={cn(
              'min-h-0 flex-col @3xl/mail:flex',
              reading && selected ? 'flex' : 'hidden',
            )}
          >
            <div className='shrink-0 border-b px-3 py-2 @3xl/mail:hidden'>
              <Button variant='ghost' onClick={() => setReading(false)}>
                <ArrowLeft aria-hidden='true' className='size-4' />
                {t('workspace.backToMessages', {
                  defaultValue: 'Back to messages',
                })}
              </Button>
            </div>
            <MailConversationView
              availableLabels={selectedMessageCanUseLabels ? customLabels : []}
              actions={
                selectedMessageAccount?.status === 'active'
                  ? {
                      archive: selectedMessageCanMove
                        ? (message) => {
                            const archive = foldersByAccountId
                              .get(message.accountId)
                              ?.find((folder) => folder.type === 'archive');
                            if (archive)
                              mutateMessage(
                                mail.moveMessage({
                                  accountId: message.accountId,
                                  messageId: message.id,
                                  providerFolderId: archive.providerFolderId,
                                }),
                                true,
                              );
                          }
                        : undefined,
                      delete: (message) => deleteWorkspaceMessage(message),
                      downloadAttachment: (message, attachment) => {
                        void downloadAttachment(
                          mail,
                          message,
                          attachment,
                        ).catch((cause) =>
                          setError(
                            mailErrorMessage(
                              cause,
                              t('workspace.downloadFailed', {
                                defaultValue: 'Unable to download attachment.',
                              }),
                            ),
                          ),
                        );
                      },
                      reply: (message) =>
                        openComposer(
                          {
                            ...EMPTY_COMPOSER,
                            mode: 'reply',
                            relatedMessageId: message.id,
                            to: message.from?.address ?? '',
                            subject: replySubject(message.subject),
                          },
                          [],
                          message.accountId,
                        ),
                      forward: (message) =>
                        openComposer(
                          {
                            ...EMPTY_COMPOSER,
                            mode: 'forward',
                            relatedMessageId: message.id,
                            subject: forwardSubject(message.subject),
                          },
                          [],
                          message.accountId,
                        ),
                      editDraft: selectedMessageCanDraft
                        ? (message) =>
                            openComposer(
                              {
                                ...EMPTY_COMPOSER,
                                mode: 'edit',
                                draftMessageId: message.id,
                                fromAddress: message.from?.address,
                                to: formatAddressList(message.to),
                                cc: formatAddressList(message.cc),
                                bcc: formatAddressList(message.bcc),
                                subject: message.subject,
                                text: message.text ?? '',
                                html:
                                  message.html ??
                                  plainTextToMailHtml(message.text ?? ''),
                                draftConflict: message.draftConflict,
                              },
                              message.attachments,
                              message.accountId,
                            )
                        : undefined,
                      toggleRead: (message) =>
                        mutateMessage(
                          mail.updateMessage({
                            accountId: message.accountId,
                            messageId: message.id,
                            read: !message.read,
                          }),
                        ),
                      toggleStarred: (message) =>
                        mutateMessage(
                          mail.updateMessage({
                            accountId: message.accountId,
                            messageId: message.id,
                            starred: !message.starred,
                          }),
                        ),
                      toggleTodo: (message) =>
                        mutateMessage(
                          mail.updateMessage({
                            accountId: message.accountId,
                            messageId: message.id,
                            todo: !message.todo,
                          }),
                        ),
                      saveNote: (message, note) =>
                        mutateMessage(
                          mail.updateMessage({
                            accountId: message.accountId,
                            messageId: message.id,
                            note: note.trim() || null,
                          }),
                        ),
                      toggleLabel: selectedMessageCanUseLabels
                        ? (message, labelId, assigned) =>
                            mutateMessage(
                              mail.updateMessageLabels({
                                accountId: message.accountId,
                                messageId: message.id,
                                addLabelIds: assigned ? [labelId] : [],
                                removeLabelIds: assigned ? [] : [labelId],
                              }),
                            )
                        : undefined,
                    }
                  : undefined
              }
              actionLabels={{
                archive: t('workspace.archive', { defaultValue: 'Archive' }),
                delete: selectedMessageInTrash
                  ? t('workspace.permanentlyDelete', {
                      defaultValue: 'Permanently delete',
                    })
                  : t('workspace.delete', { defaultValue: 'Delete' }),
                download: t('workspace.download', { defaultValue: 'Download' }),
                reply: t('workspace.reply', { defaultValue: 'Reply' }),
                forward: t('workspace.forward', { defaultValue: 'Forward' }),
                editDraft: t('workspace.editDraft', {
                  defaultValue: 'Edit draft',
                }),
                markRead: t('workspace.markRead', {
                  defaultValue: 'Mark read',
                }),
                markUnread: t('workspace.markUnread', {
                  defaultValue: 'Mark unread',
                }),
                star: t('workspace.star', { defaultValue: 'Star' }),
                unstar: t('workspace.unstar', { defaultValue: 'Remove star' }),
                collapseMessage: t('workspace.collapseMessage', {
                  defaultValue: 'Collapse message',
                }),
                expandMessage: t('workspace.expandMessage', {
                  defaultValue: 'Expand message',
                }),
              }}
              labels={{
                attachmentCount: (count) =>
                  t('workspace.attachmentCount', {
                    count,
                    defaultValue: '{{count}} attachments',
                  }),
                conversation: (count) =>
                  t('workspace.conversation', {
                    count,
                    defaultValue: '{{count}} messages in this conversation',
                  }),
                loadMore: t('workspace.loadEarlier', {
                  defaultValue: 'Load earlier messages',
                }),
                noSubject: t('workspace.noSubject', {
                  defaultValue: '(no subject)',
                }),
                selectMessage: t('workspace.selectMessage', {
                  defaultValue: 'Select a message to read it.',
                }),
                unknownSender: t('workspace.unknownSender', {
                  defaultValue: 'Unknown sender',
                }),
                labels: t('workspace.labels', { defaultValue: 'Labels' }),
                note: t('workspace.note', { defaultValue: 'Note' }),
                notePlaceholder: t('workspace.notePlaceholder', {
                  defaultValue: 'Add a private note…',
                }),
                saveNote: t('workspace.saveNote', {
                  defaultValue: 'Save note',
                }),
                todo: t('workspace.todo', { defaultValue: 'To do' }),
              }}
              loading={loadingConversation}
              messages={conversation}
              nextCursor={conversationCursor}
              onLoadMore={loadMoreConversation}
              subject={selected?.subject}
            />
          </div>
        </div>
      )}
      <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
        <SheetContent
          side='left'
          className='w-72 p-0'
          closeLabel={t('workspace.closeNavigation', {
            defaultValue: 'Close mailbox navigation',
          })}
        >
          <SheetHeader className='border-b pr-12'>
            <SheetTitle>
              {t('workspace.mailboxNavigation', {
                defaultValue: 'Mailbox navigation',
              })}
            </SheetTitle>
          </SheetHeader>
          {navigationOpen ? mailboxNavigation : null}
        </SheetContent>
      </Sheet>
      {composerRequest ? (
        <MailComposer
          request={composerRequest}
          accounts={accounts}
          providers={providers}
          templateVariables={templateVariables}
          onClose={() => setComposerRequest(undefined)}
          onComplete={(result) => {
            setReloadVersion((version) => version + 1);
            setNotice(
              result === 'unknown'
                ? t('workspace.submissionUnknown', {
                    defaultValue:
                      'Delivery could not be confirmed. Check your provider before sending again.',
                  })
                : result === 'failed'
                  ? t('workspace.submissionFailed', {
                      defaultValue:
                        'One or more messages could not be sent. Check the delivery result before retrying.',
                    })
                  : result === 'draft'
                    ? t('workspace.draftSaved', { defaultValue: 'Draft saved' })
                    : t('workspace.accepted', {
                        defaultValue: 'Message queued for delivery.',
                      }),
            );
          }}
        />
      ) : null}
    </section>
  );
}

function isActiveSyncRun(run: MailSyncRunView): boolean {
  return run.status === 'pending' || run.status === 'running';
}

function resolveComposeAccountId(
  accounts: readonly MailAccountView[],
  providers: readonly MailProviderView[],
  preferredId?: string,
): string {
  const preferred = accounts.find((account) => account.id === preferredId);
  if (preferred && isSendCapableAccount(preferred, providers)) {
    return preferred.id;
  }
  return (
    accounts.find((account) => isSendCapableAccount(account, providers))?.id ??
    preferred?.id ??
    accounts[0]?.id ??
    ''
  );
}

function isSendCapableAccount(
  account: MailAccountView,
  providers: readonly MailProviderView[],
): boolean {
  return Boolean(
    account.status === 'active' &&
    findProviderCapabilities(account, providers)?.send,
  );
}

function readLastComposeAccountId(userId?: string): string | undefined {
  if (!userId) return undefined;
  try {
    return (
      window.localStorage.getItem(
        `${LAST_COMPOSE_ACCOUNT_KEY_PREFIX}${encodeURIComponent(userId)}`,
      ) ?? undefined
    );
  } catch {
    return undefined;
  }
}

function writeLastComposeAccountId(account: MailAccountView): void {
  try {
    window.localStorage.setItem(
      `${LAST_COMPOSE_ACCOUNT_KEY_PREFIX}${encodeURIComponent(account.userId)}`,
      account.id,
    );
  } catch {
    // Browser privacy settings or storage pressure can disable this preference.
  }
}

function findProviderCapabilities(
  account: MailAccountView | undefined,
  providers: readonly MailProviderView[],
): MailProviderCapabilities | undefined {
  if (!account) return undefined;
  return providers.find(
    (provider) =>
      provider.type === account.provider.type &&
      provider.name === account.provider.name,
  )?.capabilities;
}

function isMessageInTrash(
  message: Pick<MailMessage, 'accountId' | 'folderIds'>,
  foldersByAccountId: ReadonlyMap<string, readonly MailFolder[]>,
): boolean {
  const trash = foldersByAccountId
    .get(message.accountId)
    ?.find((folder) => folder.type === 'trash');
  return Boolean(trash && message.folderIds.includes(trash.providerFolderId));
}

function formatAddressList(
  addresses: readonly { address: string; name?: string }[],
): string {
  return addresses.map((address) => address.address).join(', ');
}

function replySubject(subject: string): string {
  return /^re:/iu.test(subject.trim()) ? subject : `Re: ${subject}`;
}

function forwardSubject(subject: string): string {
  return /^fwd?:/iu.test(subject.trim()) ? subject : `Fwd: ${subject}`;
}

async function downloadAttachment(
  mail: MailClient,
  message: MailMessage,
  attachment: MailMessage['attachments'][number],
): Promise<void> {
  const stream = await mail.downloadAttachment(
    message.accountId,
    message.id,
    attachment.id,
  );
  const blob = await new Response(stream, {
    headers: { 'content-type': attachment.contentType },
  }).blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = attachment.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
