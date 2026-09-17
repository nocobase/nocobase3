import { ApiClientError } from '@nocobase/app-client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type {
  MailClient,
  MailAccountView,
  MailMessage,
  MailMessageSummary,
  MailMessagesQuery,
} from '../mail-client.js';
import { MAIL_UNREAD_COUNT_CHANGED_EVENT } from '../subscription.js';
import { useMailInvalidations } from './use-mail-invalidations.js';

interface MailWorkspaceDataOptions {
  readonly mail: MailClient;
  readonly accounts: readonly MailAccountView[];
  readonly messageQuery: MailMessagesQuery;
  readonly reloadVersion: number;
  readonly requestError: (cause: unknown) => void;
  readonly setError: Dispatch<SetStateAction<string | undefined>>;
  readonly onFocus: () => void;
}

/** Owns list/conversation state, pagination and stale responses for one mailbox view. */
export function useMailWorkspaceData({
  mail,
  accounts,
  messageQuery,
  reloadVersion,
  requestError,
  setError,
  onFocus,
}: MailWorkspaceDataOptions): MailWorkspaceData {
  const [messages, setMessages] = useState<readonly MailMessageSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [pageCursors, setPageCursors] = useState<
    readonly (string | undefined)[]
  >([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [listVersion, setListVersion] = useState(0);
  const [selected, setSelected] = useState<MailMessageSummary>();
  const [conversation, setConversation] = useState<readonly MailMessage[]>([]);
  const [conversationCursor, setConversationCursor] = useState<string>();
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const conversationRequestIdRef = useRef(0);
  const markingReadRef = useRef(new Set<string>());
  const messageRequestIdRef = useRef(0);
  const loadedMessageQueryRef = useRef<typeof messageQuery | undefined>(
    undefined,
  );
  const messagePageRequestRef = useRef<number | undefined>(undefined);

  const backgroundRefreshIdRef = useRef(0);
  useEffect(
    () => () => {
      backgroundRefreshIdRef.current += 1;
    },
    [],
  );
  useMailInvalidations(() => {
    if (
      loadingMessages ||
      loadingConversation ||
      loadedMessageQueryRef.current !== messageQuery
    )
      return false;
    const refreshId = ++backgroundRefreshIdRef.current;
    const requestId = messageRequestIdRef.current;
    const refreshSelection = selected && !loadingConversation;
    const conversationRequestId = refreshSelection
      ? ++conversationRequestIdRef.current
      : conversationRequestIdRef.current;
    void Promise.allSettled([
      mail.listMessages({ ...messageQuery, cursor: pageCursors[pageIndex] }),
      refreshSelection
        ? selected.conversationId
          ? reloadConversation(mail, selected, conversation.length)
          : mail.getMessage(selected.accountId, selected.id).then((detail) => ({
              items: detail ? [detail] : [],
              nextCursor: undefined,
            }))
        : undefined,
    ])
      .then(([listResult, detailResult]) => {
        if (
          refreshId !== backgroundRefreshIdRef.current ||
          requestId !== messageRequestIdRef.current
        )
          return;
        if (listResult.status === 'rejected') {
          requestError(listResult.reason);
          return;
        }
        const page = listResult.value;
        setMessages(page.items);
        setNextCursor(page.nextCursor);
        if (detailResult.status === 'rejected') {
          if (
            detailResult.reason instanceof ApiClientError &&
            detailResult.reason.status === 404
          ) {
            if (conversationRequestId === conversationRequestIdRef.current) {
              setSelected(undefined);
              setConversation([]);
              setConversationCursor(undefined);
            }
          } else requestError(detailResult.reason);
          return;
        }
        const detail = detailResult.value;
        if (
          refreshSelection &&
          conversationRequestId === conversationRequestIdRef.current
        ) {
          const updated = page.items.find(
            (item) =>
              item.id === selected.id && item.accountId === selected.accountId,
          );
          // A conversation can gain a different representative after new mail arrives.
          const representative =
            updated ??
            page.items.find(
              (item) =>
                selected.conversationId &&
                item.accountId === selected.accountId &&
                item.conversationId === selected.conversationId,
            );
          const retainedSelection = detail?.items.length
            ? (representative ?? selected)
            : undefined;
          setSelected(retainedSelection);
          setConversation(retainedSelection ? (detail?.items ?? []) : []);
          setConversationCursor(
            retainedSelection ? detail?.nextCursor : undefined,
          );
        }
      })
      .catch((cause: unknown) => {
        if (
          refreshId === backgroundRefreshIdRef.current &&
          requestId === messageRequestIdRef.current
        )
          requestError(cause);
      });
  }, onFocus);

  useEffect(() => {
    const requestId = messageRequestIdRef.current + 1;
    messageRequestIdRef.current = requestId;
    conversationRequestIdRef.current += 1;
    loadedMessageQueryRef.current = undefined;
    void Promise.resolve()
      .then(() => {
        if (messageRequestIdRef.current !== requestId) return undefined;
        setLoadingMessages(true);
        setMessages([]);
        setNextCursor(undefined);
        setPageCursors([undefined]);
        setPageIndex(0);
        setListVersion((version) => version + 1);
        setSelected(undefined);
        setConversation([]);
        setConversationCursor(undefined);
        setLoadingConversation(false);
        setError(undefined);
        return accounts.length === 0
          ? { items: [], nextCursor: undefined }
          : mail.listMessages(messageQuery);
      })
      .then(
        (page) => {
          if (!page || messageRequestIdRef.current !== requestId) return;
          loadedMessageQueryRef.current = messageQuery;
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
  }, [accounts, mail, messageQuery, reloadVersion, requestError, setError]);

  const markOpenedMessagesRead = useCallback(
    (openedMessages: readonly MailMessage[], requestId: number): void => {
      for (const message of openedMessages) {
        const key = `${message.accountId}:${message.id}`;
        if (
          message.read ||
          message.draft ||
          markingReadRef.current.has(key) ||
          !accounts.some(
            (account) =>
              account.id === message.accountId && account.status === 'active',
          )
        )
          continue;
        markingReadRef.current.add(key);
        void mail
          .updateMessage({
            accountId: message.accountId,
            messageId: message.id,
            read: true,
          })
          .then((updated) => {
            backgroundRefreshIdRef.current += 1;
            const matches = (item: MailMessageSummary): boolean =>
              item.accountId === updated.accountId && item.id === updated.id;
            // Patch only read state so other edits made while this request ran survive.
            setMessages((current) =>
              current.map((item) =>
                matches(item) ? { ...item, read: updated.read } : item,
              ),
            );
            setConversation((current) =>
              current.map((item) =>
                matches(item) ? { ...item, read: updated.read } : item,
              ),
            );
            setSelected((current) =>
              current && matches(current)
                ? { ...current, read: updated.read }
                : current,
            );
            window.dispatchEvent(new Event(MAIL_UNREAD_COUNT_CHANGED_EVENT));
          })
          .catch((cause: unknown) => {
            if (conversationRequestIdRef.current === requestId)
              requestError(cause);
          })
          .finally(() => {
            markingReadRef.current.delete(key);
          });
      }
    },
    [accounts, mail, requestError],
  );

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
          markOpenedMessagesRead(page.items, requestId);
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
    [mail, markOpenedMessagesRead, requestError, setError],
  );

  const changeMessagePage = (targetIndex: number): void => {
    if (
      loadingMessages ||
      loadedMessageQueryRef.current !== messageQuery ||
      messagePageRequestRef.current === messageRequestIdRef.current ||
      targetIndex < 0 ||
      targetIndex > pageIndex + 1 ||
      (targetIndex > pageIndex && !nextCursor)
    )
      return;
    backgroundRefreshIdRef.current += 1;
    const cursor =
      targetIndex > pageIndex ? nextCursor : pageCursors[targetIndex];
    const requestId = messageRequestIdRef.current;
    messagePageRequestRef.current = requestId;
    setLoadingMessages(true);
    setError(undefined);
    void mail
      .listMessages({ ...messageQuery, cursor })
      .then((page) => {
        if (messageRequestIdRef.current !== requestId) return;
        setMessages(page.items);
        setNextCursor(page.nextCursor);
        setPageCursors((current) => [...current.slice(0, targetIndex), cursor]);
        setPageIndex(targetIndex);
        setListVersion((version) => version + 1);
        setSelected(undefined);
        setConversation([]);
        setConversationCursor(undefined);
        setLoadingConversation(false);
        conversationRequestIdRef.current += 1;
      })
      .catch((cause: unknown) => {
        if (messageRequestIdRef.current === requestId) requestError(cause);
      })
      .finally(() => {
        if (messagePageRequestRef.current === requestId)
          messagePageRequestRef.current = undefined;
        if (messageRequestIdRef.current === requestId)
          setLoadingMessages(false);
      });
  };

  const loadMoreConversation = (): void => {
    if (!selected?.conversationId || !conversationCursor || loadingConversation)
      return;
    const requestId = ++conversationRequestIdRef.current;
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
        markOpenedMessagesRead(page.items, requestId);
      })
      .catch((cause: unknown) => {
        if (conversationRequestIdRef.current === requestId) requestError(cause);
      })
      .finally(() => {
        if (conversationRequestIdRef.current === requestId)
          setLoadingConversation(false);
      });
  };

  const updateVisibleMessage = (updated: MailMessage): void => {
    backgroundRefreshIdRef.current += 1;
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

  const cancelRequests = useCallback((): void => {
    messageRequestIdRef.current += 1;
    conversationRequestIdRef.current += 1;
    backgroundRefreshIdRef.current += 1;
  }, []);
  const clearSelection = useCallback((): void => {
    conversationRequestIdRef.current += 1;
    setSelected(undefined);
    setConversation([]);
    setConversationCursor(undefined);
    setLoadingConversation(false);
  }, []);
  const resetMailbox = useCallback((): void => {
    cancelRequests();
    clearSelection();
    setMessages([]);
    setNextCursor(undefined);
    setLoadingMessages(false);
  }, [cancelRequests, clearSelection]);

  return {
    messages,
    nextCursor,
    pageIndex,
    listVersion,
    selected,
    conversation,
    conversationCursor,
    loadingMessages,
    loadingConversation,
    selectMessage,
    changeMessagePage,
    loadMoreConversation,
    updateVisibleMessage,
    clearSelection,
    resetMailbox,
    cancelRequests,
  };
}

interface MailWorkspaceData {
  readonly messages: readonly MailMessageSummary[];
  readonly nextCursor: string | undefined;
  readonly pageIndex: number;
  readonly listVersion: number;
  readonly selected: MailMessageSummary | undefined;
  readonly conversation: readonly MailMessage[];
  readonly conversationCursor: string | undefined;
  readonly loadingMessages: boolean;
  readonly loadingConversation: boolean;
  readonly selectMessage: (message: MailMessageSummary) => void;
  readonly changeMessagePage: (index: number) => void;
  readonly loadMoreConversation: () => void;
  readonly updateVisibleMessage: (message: MailMessage) => void;
  readonly clearSelection: () => void;
  readonly resetMailbox: () => void;
  readonly cancelRequests: () => void;
}

async function reloadConversation(
  mail: MailClient,
  selected: MailMessageSummary,
  loadedCount: number,
): Promise<{
  readonly items: readonly MailMessage[];
  readonly nextCursor?: string;
}> {
  const items: MailMessage[] = [];
  let cursor: string | undefined;
  const target = Math.max(50, loadedCount);
  do {
    const page = await mail.listConversationMessages(
      selected.accountId,
      selected.conversationId!,
      { limit: Math.min(200, target - items.length), cursor },
    );
    items.unshift(...page.items);
    cursor = page.nextCursor;
    if (page.items.length === 0) break;
  } while (cursor && items.length < target);
  return { items, nextCursor: cursor };
}
