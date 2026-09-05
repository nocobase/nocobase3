import { RefreshCw, Search } from 'lucide-react';
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
import {
  mailErrorMessage,
  type MailAccountView,
  type MailFolder,
  type MailMessage,
  type MailMessageSummary,
} from '../mail-client.js';
import { getMailClient } from '../runtime.js';

const mail = getMailClient();

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
  const [error, setError] = useState<string>();
  const [reloadVersion, setReloadVersion] = useState(0);
  const conversationRequestIdRef = useRef(0);
  const messageRequestIdRef = useRef(0);
  const accountIdRef = useRef('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

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
        }
      })
      .catch(requestError)
      .finally(() => setLoadingAccounts(false));
  }, [requestError]);

  useEffect(() => {
    void Promise.resolve().then(loadAccounts);
  }, [loadAccounts]);

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

  return (
    <main className='flex min-h-[calc(100svh-4rem)] flex-col bg-background'>
      <header className='flex flex-wrap items-center gap-3 border-b px-4 py-3'>
        <h1 className='mr-auto text-lg font-semibold'>
          {t('workspace.title', { defaultValue: 'Mail' })}
        </h1>
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
          aria-label={t('actions.refresh', { defaultValue: 'Refresh' })}
          disabled={loadingAccounts || loadingMessages || loadingConversation}
          onClick={() => {
            loadAccounts();
            setReloadVersion((version) => version + 1);
          }}
          variant='outline'
        >
          <RefreshCw aria-hidden='true' className='size-4' />
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
              messageRequestIdRef.current += 1;
              conversationRequestIdRef.current += 1;
              accountIdRef.current = value;
              setAccountId(value);
              setFolderId(undefined);
              setSmartView('all');
            }}
            onFolderChange={(value) => {
              messageRequestIdRef.current += 1;
              conversationRequestIdRef.current += 1;
              setFolderId(value);
            }}
            onSmartViewChange={(value) => {
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
    </main>
  );
}
