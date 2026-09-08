import { Paperclip, PenLine, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import {
  MailboxSidebar,
  MailConversationView,
  MailMessageList,
  type MailboxSmartView,
} from '../components/index.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { NativeSelect } from '../components/ui/native-select.js';
import { Textarea } from '../components/ui/textarea.js';
import {
  mailErrorMessage,
  type MailAccountView,
  type MailBulkComposeInput,
  type MailClient,
  type MailComposeInput,
  type MailFolder,
  type MailMessage,
  type MailMessageSummary,
  type MailIdentity,
  type MailOutboundAttachmentView,
  type MailSyncRunView,
  type MailTemplate,
} from '../mail-client.js';
import { getMailClient } from '../runtime.js';

const mail = getMailClient();

interface ComposerState {
  readonly mode: 'new' | 'reply' | 'forward' | 'edit';
  readonly relatedMessageId?: string;
  readonly draftMessageId?: string;
  readonly fromAddress?: string;
  readonly to: string;
  readonly cc: string;
  readonly bcc: string;
  readonly subject: string;
  readonly text: string;
  readonly scheduledAt: string;
}

const EMPTY_COMPOSER: ComposerState = {
  mode: 'new',
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  text: '',
  scheduledAt: '',
};

export default function MailWorkspacePage(): ReactElement {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<readonly MailAccountView[]>([]);
  const [accountId, setAccountId] = useState('');
  const [folders, setFolders] = useState<readonly MailFolder[]>([]);
  const [folderId, setFolderId] = useState<string>();
  const [smartView, setSmartView] = useState<MailboxSmartView>('all');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<readonly MailMessageSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [selected, setSelected] = useState<MailMessageSummary>();
  const [conversation, setConversation] = useState<readonly MailMessage[]>([]);
  const [conversationCursor, setConversationCursor] = useState<string>();
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [syncRun, setSyncRun] = useState<MailSyncRunView>();
  const [error, setError] = useState<string>();
  const [reloadVersion, setReloadVersion] = useState(0);
  const conversationRequestIdRef = useRef(0);
  const messageRequestIdRef = useRef(0);
  const accountIdRef = useRef('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [composer, setComposer] = useState<ComposerState>();
  const [identities, setIdentities] = useState<readonly MailIdentity[]>([]);
  const [identityId, setIdentityId] = useState('');
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<readonly MailTemplate[]>([]);
  const [individualDelivery, setIndividualDelivery] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [composeAttachments, setComposeAttachments] = useState<
    readonly MailOutboundAttachmentView[]
  >([]);
  const [retainedAttachments, setRetainedAttachments] = useState<
    ReadonlyArray<MailMessage['attachments'][number]>
  >([]);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

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

  const loadAccounts = useCallback((): void => {
    setLoadingAccounts(true);
    setError(undefined);
    void mail
      .listAccounts()
      .then((nextAccounts) => {
        const nextAccountId = nextAccounts.some(
          (account) => account.id === accountIdRef.current,
        )
          ? accountIdRef.current
          : (nextAccounts[0]?.id ?? '');
        setAccounts(nextAccounts);
        if (nextAccountId !== accountIdRef.current) {
          messageRequestIdRef.current += 1;
          conversationRequestIdRef.current += 1;
          accountIdRef.current = nextAccountId;
          setAccountId(nextAccountId);
          setFolders([]);
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
  }, [requestError]);

  useEffect(() => {
    void Promise.resolve().then(loadAccounts);
  }, [loadAccounts]);

  const finishSync = useCallback(
    (run: MailSyncRunView): void => {
      setSyncRun(run);
      if (run.status === 'completed') {
        loadAccounts();
        setReloadVersion((version) => version + 1);
        return;
      }
      if (run.status === 'failed' || run.status === 'cancelled') {
        const fallback = t('errors.syncFailed', {
          defaultValue: 'Could not synchronize the mailbox.',
        });
        setError(
          run.error?.code ? `${fallback} (${run.error.code})` : fallback,
        );
      }
    },
    [loadAccounts, t],
  );

  useEffect(() => {
    if (!syncRun || !['pending', 'running'].includes(syncRun.status)) return;
    const timer = window.setInterval(() => {
      void mail.getSyncRun(syncRun.id).then(finishSync, (cause: unknown) => {
        setSyncRun(undefined);
        requestError(cause);
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [finishSync, requestError, syncRun]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const messageQuery = useMemo(
    () => ({
      accountId,
      folderId,
      query: debouncedQuery.trim() || undefined,
      unread: smartView === 'unread' ? true : undefined,
      starred: smartView === 'starred' ? true : undefined,
      limit: 50,
    }),
    [accountId, debouncedQuery, folderId, smartView],
  );

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    void mail.listFolders(accountId).then(
      (nextFolders) => {
        if (!active) return;
        setFolders(nextFolders);
      },
      (cause: unknown) => {
        if (active) requestError(cause);
      },
    );
    return () => {
      active = false;
    };
  }, [accountId, reloadVersion, requestError]);

  useEffect(() => {
    if (!accountId) return;
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
  }, [accountId, messageQuery, reloadVersion, requestError]);

  const selectMessage = useCallback(
    (message: MailMessageSummary): void => {
      const requestId = conversationRequestIdRef.current + 1;
      conversationRequestIdRef.current = requestId;
      setSelected(message);
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
    [requestError],
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

  const startIncrementalSync = (): void => {
    if (
      !accountId ||
      syncRun?.status === 'pending' ||
      syncRun?.status === 'running'
    )
      return;
    setError(undefined);
    void mail
      .startSync({ accountId, mode: 'incremental' })
      .then(finishSync)
      .catch(requestError);
  };

  const updateVisibleMessage = (updated: MailMessage): void => {
    setConversation((current) =>
      current.map((message) => (message.id === updated.id ? updated : message)),
    );
    setMessages((current) =>
      current.map((message) => (message.id === updated.id ? updated : message)),
    );
    setSelected((current) => (current?.id === updated.id ? updated : current));
  };

  const mutateMessage = (
    operation: Promise<MailMessage | void>,
    removeMessage = false,
  ): void => {
    setError(undefined);
    void operation.then((updated) => {
      if (updated) updateVisibleMessage(updated);
      if (removeMessage) {
        setSelected(undefined);
        setConversation([]);
        setReloadVersion((version) => version + 1);
      }
    }, requestError);
  };

  const openComposer = (
    next: ComposerState,
    existingAttachments: MailMessage['attachments'] = [],
  ): void => {
    if (!accountId) return;
    setComposer(next);
    setComposeAttachments([]);
    setRetainedAttachments(existingAttachments);
    setIndividualDelivery(false);
    setError(undefined);
    void mail.listTemplates().then(setTemplates, requestError);
    void mail.listIdentities(accountId).then((items) => {
      setIdentities(items);
      setIdentityId(
        items.find(
          (identity) =>
            identity.canSend &&
            identity.address.toLowerCase() === next.fromAddress?.toLowerCase(),
        )?.id ??
          items.find((identity) => identity.isPrimary && identity.canSend)
            ?.id ??
          items.find((identity) => identity.canSend)?.id ??
          '',
      );
    }, requestError);
  };

  const closeComposer = (): void => {
    setComposer(undefined);
    setComposeAttachments([]);
    setRetainedAttachments([]);
  };

  const sendComposer = (): void => {
    if (!composer || !accountId || !identityId || sending) return;
    const to = parseAddressList(composer.to);
    if (to.length === 0) {
      setError(
        t('workspace.recipientRequired', {
          defaultValue: 'Add at least one recipient.',
        }),
      );
      return;
    }
    setSending(true);
    setError(undefined);
    const input = buildComposerInput(
      accountId,
      identityId,
      composer,
      composeAttachments,
      retainedAttachments,
    );
    const operation = individualDelivery
      ? mail.sendBulk(toBulkComposeInput(input))
      : mail.sendMessage(input);
    void operation
      .then(() => {
        closeComposer();
        setReloadVersion((version) => version + 1);
      })
      .catch(requestError)
      .finally(() => setSending(false));
  };

  const saveComposerDraft = (): void => {
    if (!composer || !accountId || !identityId || sending) return;
    setSending(true);
    setError(undefined);
    void mail
      .saveDraft(
        buildComposerInput(
          accountId,
          identityId,
          composer,
          composeAttachments,
          retainedAttachments,
        ),
      )
      .then(() => {
        closeComposer();
        setReloadVersion((version) => version + 1);
      })
      .catch(requestError)
      .finally(() => setSending(false));
  };

  const uploadComposerAttachments = (files: FileList | null): void => {
    if (!files?.length || uploading) return;
    setUploading(true);
    setError(undefined);
    void Promise.all([...files].map((file) => mail.uploadAttachment(file)))
      .then((uploaded) =>
        setComposeAttachments((current) => [...current, ...uploaded]),
      )
      .catch(requestError)
      .finally(() => {
        setUploading(false);
        if (attachmentInputRef.current) attachmentInputRef.current.value = '';
      });
  };

  const syncing =
    syncRun?.status === 'pending' || syncRun?.status === 'running';

  return (
    <section className='flex min-h-[38rem] flex-col bg-background'>
      <header className='flex flex-wrap items-center gap-3 border-b bg-muted/20 px-4 py-3'>
        <h1 className='mr-auto text-lg font-semibold'>
          {t('workspace.title', { defaultValue: 'Mail' })}
        </h1>
        <Button
          disabled={!accountId}
          onClick={() => openComposer(EMPTY_COMPOSER)}
        >
          <PenLine aria-hidden='true' className='size-4' />
          {t('workspace.compose', { defaultValue: 'Compose' })}
        </Button>
        <label className='relative w-full sm:w-80'>
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
        <Button
          aria-label={t('workspace.incrementalRefresh', {
            defaultValue: 'Sync updates',
          })}
          disabled={
            !accountId ||
            syncing ||
            loadingAccounts ||
            loadingMessages ||
            loadingConversation
          }
          onClick={startIncrementalSync}
          variant='outline'
        >
          <RefreshCw
            aria-hidden='true'
            className={`size-4 ${syncing ? 'animate-spin' : ''}`}
          />
          {syncing
            ? t('workspace.syncing', { defaultValue: 'Syncing updates…' })
            : t('workspace.incrementalRefresh', {
                defaultValue: 'Sync updates',
              })}
        </Button>
      </header>

      {error ? (
        <div className='border-b bg-destructive/5 px-4 py-2 text-sm text-destructive'>
          {error}
        </div>
      ) : null}

      {accounts.length === 0 && !loadingAccounts ? (
        <div className='grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground'>
          {t('workspace.noAccounts', {
            defaultValue:
              'Connect a mail account in Settings to view synchronized messages.',
          })}
        </div>
      ) : (
        <div className='grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(18rem,40svh)_minmax(22rem,1fr)] lg:grid-cols-[15rem_22rem_minmax(0,1fr)] lg:grid-rows-1'>
          <MailboxSidebar
            accountId={accountId}
            accounts={accounts}
            folderId={folderId}
            folders={folders}
            labels={{
              account: t('dev.account', { defaultValue: 'Account' }),
              allMail: t('workspace.allMail', { defaultValue: 'All mail' }),
              unread: t('workspace.unreadOnly', { defaultValue: 'Unread' }),
              starred: t('workspace.starredOnly', { defaultValue: 'Starred' }),
              folders: t('workspace.folders', { defaultValue: 'Folders' }),
            }}
            onAccountChange={(value) => {
              if (value === accountId) return;
              messageRequestIdRef.current += 1;
              conversationRequestIdRef.current += 1;
              accountIdRef.current = value;
              setAccountId(value);
              setFolderId(undefined);
              setSmartView('all');
            }}
            onFolderChange={(value) => {
              if (value === folderId) return;
              messageRequestIdRef.current += 1;
              conversationRequestIdRef.current += 1;
              setFolderId(value);
            }}
            onSmartViewChange={(value) => {
              if (value === smartView) return;
              messageRequestIdRef.current += 1;
              conversationRequestIdRef.current += 1;
              setSmartView(value);
            }}
            smartView={smartView}
          />
          <MailMessageList
            labels={{
              empty: t('workspace.empty', {
                defaultValue: 'No messages match this mailbox view.',
              }),
              loadMore: t('workspace.loadMore', { defaultValue: 'Load more' }),
              noSubject: t('workspace.noSubject', {
                defaultValue: '(no subject)',
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
            selectedMessageId={selected?.id}
          />
          <MailConversationView
            actions={{
              archive: folders.find((folder) => folder.type === 'archive')
                ? (message) => {
                    const archive = folders.find(
                      (folder) => folder.type === 'archive',
                    );
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
              delete: (message) =>
                mutateMessage(
                  mail.deleteMessage(message.accountId, message.id),
                  true,
                ),
              downloadAttachment: (message, attachment) => {
                void downloadAttachment(mail, message, attachment).catch(
                  (cause) =>
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
                openComposer({
                  ...EMPTY_COMPOSER,
                  mode: 'reply',
                  relatedMessageId: message.id,
                  to: message.from?.address ?? '',
                  subject: replySubject(message.subject),
                }),
              forward: (message) =>
                openComposer({
                  ...EMPTY_COMPOSER,
                  mode: 'forward',
                  relatedMessageId: message.id,
                  subject: forwardSubject(message.subject),
                }),
              editDraft: (message) =>
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
                  },
                  message.attachments,
                ),
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
            }}
            actionLabels={{
              archive: t('workspace.archive', { defaultValue: 'Archive' }),
              delete: t('workspace.delete', { defaultValue: 'Delete' }),
              download: t('workspace.download', { defaultValue: 'Download' }),
              reply: t('workspace.reply', { defaultValue: 'Reply' }),
              forward: t('workspace.forward', { defaultValue: 'Forward' }),
              editDraft: t('workspace.editDraft', {
                defaultValue: 'Edit draft',
              }),
              markRead: t('workspace.markRead', { defaultValue: 'Mark read' }),
              markUnread: t('workspace.markUnread', {
                defaultValue: 'Mark unread',
              }),
              star: t('workspace.star', { defaultValue: 'Star' }),
              unstar: t('workspace.unstar', { defaultValue: 'Remove star' }),
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
            }}
            loading={loadingConversation}
            messages={conversation}
            nextCursor={conversationCursor}
            onLoadMore={loadMoreConversation}
            subject={selected?.subject}
          />
        </div>
      )}
      {composer ? (
        <aside
          aria-label={t('workspace.composerTitle', {
            defaultValue: 'New message',
          })}
          aria-modal='true'
          className='fixed right-5 bottom-5 z-50 flex max-h-[calc(100svh-2.5rem)] w-[min(38rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl'
          role='dialog'
        >
          <header className='flex items-center border-b bg-muted/30 px-4 py-3'>
            <h2 className='font-semibold'>
              {t(`workspace.composer.${composer.mode}`, {
                defaultValue:
                  composer.mode === 'reply'
                    ? 'Reply'
                    : composer.mode === 'forward'
                      ? 'Forward'
                      : composer.mode === 'edit'
                        ? 'Edit draft'
                        : 'New message',
              })}
            </h2>
            <Button
              aria-label={t('workspace.closeComposer', {
                defaultValue: 'Close composer',
              })}
              className='ml-auto size-8 px-0'
              disabled={sending}
              onClick={closeComposer}
              variant='ghost'
            >
              <X />
            </Button>
          </header>
          <div className='space-y-3 overflow-y-auto p-4'>
            <NativeSelect
              aria-label={t('workspace.from', { defaultValue: 'From' })}
              onChange={(event) => setIdentityId(event.target.value)}
              value={identityId}
            >
              <option value=''>
                {t('workspace.selectSender', {
                  defaultValue: 'Select sender',
                })}
              </option>
              {identities
                .filter((identity) => identity.canSend)
                .map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.displayName
                      ? `${identity.displayName} <${identity.address}>`
                      : identity.address}
                  </option>
                ))}
            </NativeSelect>
            {(['to', 'cc', 'bcc'] as const).map((field) => (
              <Input
                aria-label={t(`workspace.${field}`, {
                  defaultValue: field.toUpperCase(),
                })}
                key={field}
                onChange={(event) =>
                  setComposer((current) =>
                    current
                      ? { ...current, [field]: event.target.value }
                      : current,
                  )
                }
                placeholder={t(`workspace.${field}`, {
                  defaultValue: field.toUpperCase(),
                })}
                value={composer[field]}
              />
            ))}
            <label className='flex items-center gap-2 text-sm text-muted-foreground'>
              <input
                checked={individualDelivery}
                disabled={composer.mode !== 'new'}
                onChange={(event) =>
                  setIndividualDelivery(event.target.checked)
                }
                type='checkbox'
              />
              {t('workspace.sendIndividually', {
                defaultValue:
                  'Send one private message per recipient (up to 100)',
              })}
            </label>
            <Input
              aria-label={t('workspace.subject', { defaultValue: 'Subject' })}
              onChange={(event) =>
                setComposer((current) =>
                  current
                    ? { ...current, subject: event.target.value }
                    : current,
                )
              }
              placeholder={t('workspace.subject', { defaultValue: 'Subject' })}
              value={composer.subject}
            />
            <Textarea
              aria-label={t('workspace.messageBody', {
                defaultValue: 'Message body',
              })}
              className='min-h-48 resize-y'
              onChange={(event) =>
                setComposer((current) =>
                  current ? { ...current, text: event.target.value } : current,
                )
              }
              placeholder={t('workspace.messageBody', {
                defaultValue: 'Write a message…',
              })}
              value={composer.text}
            />
            {templates.length > 0 ? (
              <NativeSelect
                aria-label={t('workspace.applyTemplate', {
                  defaultValue: 'Apply template',
                })}
                onChange={(event) => {
                  const template = templates.find(
                    (item) => item.id === event.target.value,
                  );
                  if (!template) return;
                  setComposer((current) =>
                    current
                      ? {
                          ...current,
                          subject: template.subject,
                          text: template.text ?? '',
                        }
                      : current,
                  );
                  event.target.value = '';
                }}
                value=''
              >
                <option value=''>
                  {t('workspace.applyTemplate', {
                    defaultValue: 'Apply template',
                  })}
                </option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </NativeSelect>
            ) : null}
            <div className='space-y-2'>
              <input
                className='sr-only'
                multiple
                onChange={(event) =>
                  uploadComposerAttachments(event.target.files)
                }
                ref={attachmentInputRef}
                type='file'
              />
              <Button
                disabled={sending || uploading}
                onClick={() => attachmentInputRef.current?.click()}
                type='button'
                variant='outline'
              >
                <Paperclip aria-hidden='true' className='size-4' />
                {uploading
                  ? t('workspace.uploadingAttachment', {
                      defaultValue: 'Uploading…',
                    })
                  : t('workspace.addAttachment', {
                      defaultValue: 'Add attachment',
                    })}
              </Button>
              {retainedAttachments.length > 0 ||
              composeAttachments.length > 0 ? (
                <ul className='space-y-1 text-sm'>
                  {retainedAttachments.map((attachment) => (
                    <li
                      className='flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1'
                      key={attachment.id}
                    >
                      <span className='min-w-0 flex-1 truncate'>
                        {attachment.fileName}
                      </span>
                      <span className='text-xs text-muted-foreground'>
                        {formatBytes(attachment.size)}
                      </span>
                      <Button
                        aria-label={t('workspace.removeAttachment', {
                          fileName: attachment.fileName,
                          defaultValue: 'Remove {{fileName}}',
                        }).replace('{{fileName}}', attachment.fileName)}
                        className='size-7 px-0'
                        disabled={sending}
                        onClick={() =>
                          setRetainedAttachments((current) =>
                            current.filter((item) => item.id !== attachment.id),
                          )
                        }
                        type='button'
                        variant='ghost'
                      >
                        <X aria-hidden='true' className='size-3.5' />
                      </Button>
                    </li>
                  ))}
                  {composeAttachments.map((attachment) => (
                    <li
                      className='flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1'
                      key={attachment.id}
                    >
                      <span className='min-w-0 flex-1 truncate'>
                        {attachment.fileName}
                      </span>
                      <span className='text-xs text-muted-foreground'>
                        {formatBytes(attachment.size)}
                      </span>
                      <Button
                        aria-label={t('workspace.removeAttachment', {
                          fileName: attachment.fileName,
                          defaultValue: 'Remove {{fileName}}',
                        }).replace('{{fileName}}', attachment.fileName)}
                        className='size-7 px-0'
                        disabled={sending}
                        onClick={() =>
                          setComposeAttachments((current) =>
                            current.filter((item) => item.id !== attachment.id),
                          )
                        }
                        type='button'
                        variant='ghost'
                      >
                        <X aria-hidden='true' className='size-3.5' />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <label className='block space-y-1 text-xs text-muted-foreground'>
              <span>
                {t('workspace.scheduledAt', {
                  defaultValue: 'Send later (optional)',
                })}
              </span>
              <Input
                min={localDateTimeMinimum()}
                onChange={(event) =>
                  setComposer((current) =>
                    current
                      ? { ...current, scheduledAt: event.target.value }
                      : current,
                  )
                }
                type='datetime-local'
                value={composer.scheduledAt}
              />
            </label>
          </div>
          <footer className='flex items-center justify-end gap-2 border-t px-4 py-3'>
            <Button
              disabled={!identityId || sending || uploading}
              onClick={saveComposerDraft}
              variant='outline'
            >
              {t('workspace.saveDraft', { defaultValue: 'Save draft' })}
            </Button>
            <Button
              disabled={sending || uploading}
              onClick={closeComposer}
              variant='outline'
            >
              {t('workspace.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              disabled={!identityId || sending || uploading}
              onClick={sendComposer}
            >
              {sending
                ? t('workspace.sending', { defaultValue: 'Sending…' })
                : composer.scheduledAt
                  ? t('workspace.scheduleSend', {
                      defaultValue: 'Schedule send',
                    })
                  : t('workspace.send', { defaultValue: 'Send' })}
            </Button>
          </footer>
        </aside>
      ) : null}
    </section>
  );
}

function parseAddressList(value: string): readonly { address: string }[] {
  return value
    .split(/[;,]/u)
    .map((address) => address.trim())
    .filter(Boolean)
    .map((address) => ({ address }));
}

function buildComposerInput(
  accountId: string,
  identityId: string,
  composer: ComposerState,
  attachments: readonly MailOutboundAttachmentView[],
  retainedAttachments: MailMessage['attachments'],
): MailComposeInput {
  return {
    accountId,
    identityId,
    to: parseAddressList(composer.to),
    cc: parseAddressList(composer.cc),
    bcc: parseAddressList(composer.bcc),
    subject: composer.subject,
    text: composer.text,
    inReplyToMessageId:
      composer.mode === 'reply' ? composer.relatedMessageId : undefined,
    forwardOfMessageId:
      composer.mode === 'forward' ? composer.relatedMessageId : undefined,
    scheduledAt: composer.scheduledAt
      ? new Date(composer.scheduledAt).toISOString()
      : undefined,
    draftMessageId: composer.draftMessageId,
    attachmentIds: attachments.map((attachment) => attachment.id),
    retainedAttachmentIds: retainedAttachments.map(
      (attachment) => attachment.id,
    ),
    idempotencyKey: crypto.randomUUID(),
  };
}

function toBulkComposeInput(input: MailComposeInput): MailBulkComposeInput {
  return {
    accountId: input.accountId,
    identityId: input.identityId,
    recipients: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachmentIds: input.attachmentIds,
    scheduledAt: input.scheduledAt,
    idempotencyKey: input.idempotencyKey,
  };
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

function localDateTimeMinimum(): string {
  const now = new Date(Date.now() + 60_000);
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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
