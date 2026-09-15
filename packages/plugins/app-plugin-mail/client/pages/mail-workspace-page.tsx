import { Paperclip, PenLine, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import {
  MailboxSidebar,
  MailConversationView,
  MailMessageList,
  MailRichTextEditor,
  MAIL_UNREAD_COUNT_CHANGED_EVENT,
  type MailboxSmartView,
} from '../components/index.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { NativeSelect } from '../components/ui/native-select.js';
import {
  plainTextToMailHtml,
  renderMailTemplate,
  sanitizeMailHtml,
  type MailTemplateVariables,
} from '../lib/mail-template.js';
import { mergeMailFolders } from '../lib/mail-folders.js';
import { replaceMailSignatureContent } from '../lib/mail-signature.js';
import {
  mailErrorMessage,
  type MailAccountView,
  type MailBulkComposeInput,
  type MailClient,
  type MailComposeInput,
  type MailDraftConflict,
  type MailFolder,
  type MailIdentity,
  type MailLabel,
  type MailMessage,
  type MailMessageSummary,
  type MailProviderCapabilities,
  type MailProviderView,
  type MailSignature,
  type MailOutboundAttachmentView,
  type MailSyncRunView,
  type MailTemplate,
} from '../mail-client.js';
import { getMailClient } from '../runtime.js';
import { MAIL_PLUGIN_NS } from '../namespace.js';

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
  readonly html: string;
  readonly scheduledAt: string;
  readonly draftConflict?: MailDraftConflict;
}

const EMPTY_COMPOSER: ComposerState = {
  mode: 'new',
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  text: '',
  html: '',
  scheduledAt: '',
};

interface ComposerRecoverySnapshot {
  readonly version: 1;
  readonly accountId: string;
  readonly identityId: string;
  readonly signatureId?: string;
  readonly composer: ComposerState;
  readonly composeAttachments: readonly MailOutboundAttachmentView[];
  readonly retainedAttachments: MailMessage['attachments'];
  readonly savedFingerprint?: string;
}

export interface MailWorkspacePageProps {
  /** Values available to `{{path.to.value}}` placeholders in mail templates. */
  readonly templateVariables?: MailTemplateVariables;
}

const COMPOSER_RECOVERY_KEY_PREFIX = 'nocobase:mail:composer-recovery:v1:';
const LAST_COMPOSE_ACCOUNT_KEY_PREFIX =
  'nocobase:mail:last-compose-account:v1:';
const AUTO_SAVE_DELAY_MS = 1_000;

export default function MailWorkspacePage({
  templateVariables = {},
}: MailWorkspacePageProps = {}): ReactElement {
  const { t } = useTranslation(MAIL_PLUGIN_NS);
  const [mail] = useState(getMailClient);
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
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [syncRuns, setSyncRuns] = useState<
    Readonly<Record<string, MailSyncRunView>>
  >({});
  const syncRunsRef = useRef<Readonly<Record<string, MailSyncRunView>>>({});
  const syncPollInFlightRef = useRef(false);
  const [error, setError] = useState<string>();
  const [reloadVersion, setReloadVersion] = useState(0);
  const conversationRequestIdRef = useRef(0);
  const messageRequestIdRef = useRef(0);
  const accountIdRef = useRef('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [composeAccountId, setComposeAccountId] = useState('');
  const [composer, setComposer] = useState<ComposerState>();
  const [composerAccountId, setComposerAccountId] = useState('');
  const [composerIdentities, setComposerIdentities] = useState<
    readonly MailIdentity[]
  >([]);
  const [identityId, setIdentityId] = useState('');
  const [ccVisible, setCcVisible] = useState(false);
  const [bccVisible, setBccVisible] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [signatures, setSignatures] = useState<readonly MailSignature[]>([]);
  const [signatureId, setSignatureId] = useState('');
  const [sending, setSending] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'failed'
  >('idle');
  const [recoveryOffer, setRecoveryOffer] =
    useState<ComposerRecoverySnapshot>();
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
  const draftMessageIdRef = useRef<string | undefined>(undefined);
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState<string>();
  const failedFingerprintRef = useRef<string | undefined>(undefined);
  const composerSessionRef = useRef(0);

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
  const composerAccount = accounts.find(
    (account) => account.id === composerAccountId,
  );
  const composerProviderCapabilities = findProviderCapabilities(
    composerAccount,
    providers,
  );
  const sendableComposerIdentities = composerIdentities.filter(
    (identity) => identity.canSend,
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
  const composerCanSend = Boolean(
    composerAccount?.status === 'active' && composerProviderCapabilities?.send,
  );
  const composerCanDraft = Boolean(
    composerAccount?.status === 'active' && composerProviderCapabilities?.send,
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
    next: ComposerState,
    existingAttachments: MailMessage['attachments'] = [],
    preferredAccountId = composeAccountId,
  ): void => {
    const targetAccount = accounts.find(
      (account) => account.id === preferredAccountId,
    );
    if (!targetAccount) return;
    const targetAccountId = targetAccount.id;
    rememberComposeAccount(targetAccountId);
    setComposerAccountId(targetAccountId);
    const recovery =
      next.mode === 'new' ? readComposerRecovery(targetAccountId) : undefined;
    composerSessionRef.current += 1;
    draftMessageIdRef.current = next.draftMessageId;
    setLastSavedFingerprint(
      composerFingerprint(next, '', '', [], existingAttachments),
    );
    failedFingerprintRef.current = undefined;
    setRecoveryOffer(recovery);
    setDraftSaveStatus('idle');
    setComposer(next);
    setComposerIdentities([]);
    setCcVisible(Boolean(next.cc.trim()));
    setBccVisible(Boolean(next.bcc.trim()));
    setScheduleEnabled(Boolean(next.scheduledAt));
    setSignatures([]);
    setSignatureId(recovery?.signatureId ?? '');
    setComposeAttachments([]);
    setRetainedAttachments(existingAttachments);
    setIndividualDelivery(false);
    setError(undefined);
    void mail.listTemplates().then(setTemplates, requestError);
    void mail.listSignatures(targetAccountId).then((items) => {
      setSignatures(items);
      if (recovery?.signatureId) return;
      const defaultSignatureId = items.find((item) => item.isDefault)?.id ?? '';
      setSignatureId(defaultSignatureId);
      if (next.mode !== 'edit' && !next.text.trim() && !next.html.trim()) {
        setComposer((current) =>
          current
            ? replaceComposerSignature(current, items, defaultSignatureId)
            : current,
        );
      }
    }, requestError);
    void mail.listIdentities(targetAccountId).then((items) => {
      setComposerIdentities(items);
      const nextIdentityId =
        items.find(
          (identity) =>
            identity.canSend && identity.id === recovery?.identityId,
        )?.id ??
        items.find(
          (identity) =>
            identity.canSend &&
            identity.address.toLowerCase() === next.fromAddress?.toLowerCase(),
        )?.id ??
        items.find((identity) => identity.isPrimary && identity.canSend)?.id ??
        items.find((identity) => identity.canSend)?.id ??
        '';
      setIdentityId(nextIdentityId);
      if (!recovery) {
        setLastSavedFingerprint(
          composerFingerprint(
            next,
            nextIdentityId,
            '',
            [],
            existingAttachments,
          ),
        );
      }
    }, requestError);
  };

  const closeComposer = (force = false): void => {
    if (
      !force &&
      composer &&
      (currentComposerFingerprint !== lastSavedFingerprint ||
        Boolean(composer.scheduledAt)) &&
      !window.confirm(
        t('workspace.unsavedChangesConfirm', {
          defaultValue:
            'This message has changes that have not been saved. Close it anyway?',
        }),
      )
    ) {
      return;
    }
    composerSessionRef.current += 1;
    clearComposerRecovery(composerAccountId);
    setComposer(undefined);
    setComposerAccountId('');
    setComposerIdentities([]);
    setCcVisible(false);
    setBccVisible(false);
    setScheduleEnabled(false);
    setRecoveryOffer(undefined);
    setComposeAttachments([]);
    setRetainedAttachments([]);
    setSignatures([]);
    setSignatureId('');
    setDraftSaveStatus('idle');
  };

  const sendComposer = (): void => {
    if (
      !composer ||
      !composerAccountId ||
      !identityId ||
      !composerCanSend ||
      sending ||
      autoSaving
    )
      return;
    const to = parseAddressList(composer.to);
    if (to.length === 0) {
      setError(
        t('workspace.recipientRequired', {
          defaultValue: 'Add at least one recipient.',
        }),
      );
      return;
    }
    if (!composer.subject.trim()) {
      setError(
        t('workspace.subjectRequired', {
          defaultValue: 'Add a subject.',
        }),
      );
      return;
    }
    if (!composer.text.trim()) {
      setError(
        t('workspace.messageRequired', {
          defaultValue: 'Add a message body.',
        }),
      );
      return;
    }
    if (scheduleEnabled && !composer.scheduledAt) {
      setError(
        t('workspace.scheduledAtRequired', {
          defaultValue: 'Choose a send time.',
        }),
      );
      return;
    }
    setSending(true);
    setError(undefined);
    const input = buildComposerInput(
      composerAccountId,
      identityId,
      signatureId,
      composer,
      composeAttachments,
      retainedAttachments,
    );
    const operation = individualDelivery
      ? mail.sendBulk(toBulkComposeInput(input))
      : mail.sendMessage(input);
    void operation
      .then(() => {
        const draftId = draftMessageIdRef.current;
        closeComposer(true);
        setReloadVersion((version) => version + 1);
        if (individualDelivery && draftId) {
          void mail
            .deleteMessage(composerAccountId, draftId, true)
            .catch(requestError);
        }
      })
      .catch(requestError)
      .finally(() => setSending(false));
  };

  const saveComposerDraft = (): void => {
    if (
      !composer ||
      !composerAccountId ||
      !identityId ||
      !composerCanDraft ||
      sending ||
      autoSaving
    )
      return;
    setSending(true);
    setError(undefined);
    void mail
      .saveDraft(
        buildDraftComposerInput(
          composerAccountId,
          identityId,
          signatureId,
          composer,
          composeAttachments,
          retainedAttachments,
        ),
      )
      .then((draft) => {
        draftMessageIdRef.current = draft.id;
        clearComposerRecovery(composerAccountId);
        closeComposer(true);
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

  const currentComposerFingerprint = composer
    ? composerFingerprint(
        composer,
        identityId,
        signatureId,
        composeAttachments,
        retainedAttachments,
      )
    : undefined;
  const composerHasContent = Boolean(
    composer &&
    (composer.to.trim() ||
      composer.cc.trim() ||
      composer.bcc.trim() ||
      composer.subject.trim() ||
      composer.text.trim() ||
      composer.scheduledAt ||
      composeAttachments.length ||
      retainedAttachments.length),
  );
  const composerHasRequiredContent = Boolean(
    composer?.subject.trim() &&
    composer?.text.trim() &&
    (!scheduleEnabled || composer.scheduledAt),
  );
  const composerHasUnsavedChanges = Boolean(
    composer &&
    (currentComposerFingerprint !== lastSavedFingerprint ||
      composer.scheduledAt),
  );

  useEffect(() => {
    if (!composer || !composerAccountId || !currentComposerFingerprint) return;
    if (recoveryOffer) return;
    if (!composerHasContent && !composer.draftMessageId) {
      clearComposerRecovery(composerAccountId);
      return;
    }
    writeComposerRecovery({
      version: 1,
      accountId: composerAccountId,
      identityId,
      signatureId,
      composer,
      composeAttachments,
      retainedAttachments,
      savedFingerprint: lastSavedFingerprint,
    });
  }, [
    composeAttachments,
    composerAccountId,
    composer,
    composerHasContent,
    currentComposerFingerprint,
    draftSaveStatus,
    identityId,
    signatureId,
    lastSavedFingerprint,
    recoveryOffer,
    retainedAttachments,
  ]);

  useEffect(() => {
    if (
      !composer ||
      !composerAccountId ||
      !identityId ||
      !composerCanDraft ||
      individualDelivery ||
      (!composerHasContent &&
        !composer.draftMessageId &&
        !draftMessageIdRef.current) ||
      !currentComposerFingerprint ||
      currentComposerFingerprint === lastSavedFingerprint ||
      currentComposerFingerprint === failedFingerprintRef.current ||
      recoveryOffer ||
      sending ||
      uploading ||
      autoSaving
    ) {
      return;
    }
    const session = composerSessionRef.current;
    const fingerprint = currentComposerFingerprint;
    const snapshot = composer;
    const attachments = composeAttachments;
    const retained = retainedAttachments;
    const timer = window.setTimeout(() => {
      setAutoSaving(true);
      setDraftSaveStatus('saving');
      setError(undefined);
      void mail
        .saveDraft(
          buildDraftComposerInput(
            composerAccountId,
            identityId,
            signatureId,
            {
              ...snapshot,
              draftMessageId:
                draftMessageIdRef.current ?? snapshot.draftMessageId,
            },
            attachments,
            retained,
          ),
        )
        .then((draft) => {
          if (composerSessionRef.current !== session) return;
          draftMessageIdRef.current = draft.id;
          const savedComposer = {
            ...snapshot,
            draftMessageId: draft.id,
            draftConflict: draft.draftConflict,
            text: mergeProviderDraftBody(
              snapshot.text,
              snapshot.text,
              draft.text,
            ),
            html: mergeProviderDraftBody(
              snapshot.html,
              snapshot.html,
              draft.html,
            ),
          };
          const savedAttachments = draft.attachments ?? [];
          setLastSavedFingerprint(
            composerFingerprint(
              savedComposer,
              identityId,
              signatureId,
              [],
              savedAttachments,
            ),
          );
          failedFingerprintRef.current = undefined;
          const savedOutboundIds = new Set(
            attachments.map((attachment) => attachment.id),
          );
          setComposeAttachments((current) =>
            current.filter(
              (attachment) => !savedOutboundIds.has(attachment.id),
            ),
          );
          const capturedProviderIds = new Set(
            retained.map((attachment) => attachment.providerAttachmentId),
          );
          setRetainedAttachments((current) => {
            const retainedProviderIds = new Set(
              current.map((attachment) => attachment.providerAttachmentId),
            );
            return savedAttachments.filter(
              (attachment) =>
                !capturedProviderIds.has(attachment.providerAttachmentId) ||
                retainedProviderIds.has(attachment.providerAttachmentId),
            );
          });
          setComposer((current) =>
            current
              ? {
                  ...current,
                  draftMessageId: draft.id,
                  draftConflict: draft.draftConflict,
                  text: mergeProviderDraftBody(
                    current.text,
                    snapshot.text,
                    draft.text,
                  ),
                  html: mergeProviderDraftBody(
                    current.html,
                    snapshot.html,
                    draft.html,
                  ),
                }
              : current,
          );
          setDraftSaveStatus('saved');
        })
        .catch((cause: unknown) => {
          if (composerSessionRef.current !== session) return;
          failedFingerprintRef.current = fingerprint;
          setDraftSaveStatus('failed');
          requestError(cause);
        })
        .finally(() => {
          if (composerSessionRef.current === session) setAutoSaving(false);
        });
    }, AUTO_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [
    autoSaving,
    composeAttachments,
    composerAccountId,
    composer,
    composerHasContent,
    currentComposerFingerprint,
    composerCanDraft,
    identityId,
    individualDelivery,
    signatureId,
    lastSavedFingerprint,
    mail,
    recoveryOffer,
    requestError,
    retainedAttachments,
    sending,
    uploading,
  ]);

  useEffect(() => {
    if (!composer || !composerHasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [composer, composerHasUnsavedChanges]);

  const syncing = Object.values(syncRuns).some(isActiveSyncRun);
  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.address])),
    [accounts],
  );
  const syncLabel = isAllAccounts
    ? t('workspace.syncAll', { defaultValue: 'Sync all mailboxes' })
    : t('workspace.incrementalRefresh', { defaultValue: 'Sync mailbox' });

  return (
    <section className='flex h-full min-h-[38rem] min-w-0 flex-col bg-background lg:min-h-0'>
      <header className='flex flex-wrap items-center gap-3 border-b bg-muted/20 px-4 py-3'>
        <label className='relative min-w-0 w-full sm:w-80'>
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
        <div className='ml-auto flex flex-wrap items-center justify-end gap-2'>
          <Button
            disabled={!canSend}
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
            {syncing
              ? t('workspace.syncing', { defaultValue: 'Synchronizing…' })
              : syncLabel}
          </Button>
        </div>
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
        <div className='grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(18rem,40svh)_minmax(22rem,1fr)] overflow-hidden lg:grid-cols-[15rem_22rem_minmax(0,1fr)] lg:grid-rows-1'>
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
              if (value === folderId) return;
              messageRequestIdRef.current += 1;
              conversationRequestIdRef.current += 1;
              setFolderId(value);
            }}
            onLabelChange={(value) => {
              if (value === labelId) return;
              messageRequestIdRef.current += 1;
              conversationRequestIdRef.current += 1;
              setLabelId(value);
            }}
            onSmartViewChange={(value) => {
              if (value === smartView) return;
              messageRequestIdRef.current += 1;
              conversationRequestIdRef.current += 1;
              setSmartView(value);
              setFolderId(undefined);
              setLabelId(undefined);
            }}
            smartView={smartView}
          />
          <MailMessageList
            accountNames={accountNames}
            availableLabels={selectedMessageCanUseLabels ? customLabels : []}
            labels={{
              empty: t('workspace.empty', {
                defaultValue: 'No messages match this mailbox view.',
              }),
              loadMore: t('workspace.loadMore', { defaultValue: 'Load more' }),
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
              markRead: t('workspace.markRead', { defaultValue: 'Mark read' }),
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
              saveNote: t('workspace.saveNote', { defaultValue: 'Save note' }),
              todo: t('workspace.todo', { defaultValue: 'To do' }),
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
              disabled={sending || autoSaving}
              onClick={() => closeComposer()}
              variant='ghost'
            >
              <X />
            </Button>
          </header>
          <div className='space-y-3 overflow-y-auto p-4'>
            {recoveryOffer ? (
              <div
                className='rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm'
                role='status'
              >
                <p className='font-medium'>
                  {t('workspace.recoveryAvailable', {
                    defaultValue: 'An unfinished message can be restored.',
                  })}
                </p>
                <div className='mt-2 flex gap-2'>
                  <Button
                    onClick={() => {
                      composerSessionRef.current += 1;
                      draftMessageIdRef.current =
                        recoveryOffer.composer.draftMessageId;
                      setLastSavedFingerprint(recoveryOffer.savedFingerprint);
                      setComposer(recoveryOffer.composer);
                      setIdentityId(recoveryOffer.identityId);
                      setSignatureId(recoveryOffer.signatureId ?? '');
                      setCcVisible(Boolean(recoveryOffer.composer.cc.trim()));
                      setBccVisible(Boolean(recoveryOffer.composer.bcc.trim()));
                      setScheduleEnabled(
                        Boolean(recoveryOffer.composer.scheduledAt),
                      );
                      setComposeAttachments(recoveryOffer.composeAttachments);
                      setRetainedAttachments(recoveryOffer.retainedAttachments);
                      setRecoveryOffer(undefined);
                    }}
                    type='button'
                  >
                    {t('workspace.restoreDraft', {
                      defaultValue: 'Restore',
                    })}
                  </Button>
                  <Button
                    onClick={() => {
                      clearComposerRecovery(composerAccountId);
                      setLastSavedFingerprint(currentComposerFingerprint);
                      setRecoveryOffer(undefined);
                    }}
                    type='button'
                    variant='outline'
                  >
                    {t('workspace.discardRecovery', {
                      defaultValue: 'Discard',
                    })}
                  </Button>
                </div>
              </div>
            ) : null}
            {composer.draftConflict ? (
              <DraftConflictNotice
                conflict={composer.draftConflict}
                onUseRemote={() => {
                  const draftMessageId = composer.draftMessageId;
                  if (!draftMessageId || sending) return;
                  setSending(true);
                  setError(undefined);
                  void mail
                    .resolveDraftConflict({
                      accountId: composerAccountId,
                      action: 'useRemote',
                      messageId: draftMessageId,
                    })
                    .then((resolved) => {
                      const nextComposer: ComposerState = {
                        ...composer,
                        bcc: formatAddressList(resolved.bcc),
                        cc: formatAddressList(resolved.cc),
                        draftConflict: undefined,
                        html:
                          resolved.html ??
                          plainTextToMailHtml(resolved.text ?? ''),
                        subject: resolved.subject,
                        text: resolved.text ?? '',
                        to: formatAddressList(resolved.to),
                      };
                      draftMessageIdRef.current = resolved.id;
                      setCcVisible(Boolean(nextComposer.cc.trim()));
                      setBccVisible(Boolean(nextComposer.bcc.trim()));
                      setScheduleEnabled(Boolean(nextComposer.scheduledAt));
                      setComposer(nextComposer);
                      setComposeAttachments([]);
                      setRetainedAttachments(resolved.attachments);
                      setDraftSaveStatus('saved');
                      setLastSavedFingerprint(
                        composerFingerprint(
                          nextComposer,
                          identityId,
                          signatureId,
                          [],
                          resolved.attachments,
                        ),
                      );
                    })
                    .catch(requestError)
                    .finally(() => setSending(false));
                }}
              />
            ) : null}
            <div className='flex flex-wrap items-end gap-2'>
              <label className='min-w-0 flex-1 text-sm font-medium'>
                {t('workspace.from', { defaultValue: 'From address' })}
                <NativeSelect
                  className='mt-1'
                  disabled={sendableComposerIdentities.length === 0}
                  onChange={(event) => setIdentityId(event.target.value)}
                  value={identityId}
                >
                  {sendableComposerIdentities.length === 0 ? (
                    <option value=''>
                      {t('workspace.noSenders', {
                        defaultValue: 'No sendable addresses',
                      })}
                    </option>
                  ) : null}
                  {sendableComposerIdentities.map((identity) => (
                    <option key={identity.id} value={identity.id}>
                      {formatIdentity(identity)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </div>
            <div className='space-y-2'>
              <div className='flex items-center gap-2'>
                <Input
                  aria-label={t('workspace.to', { defaultValue: 'TO' })}
                  className='min-w-0 flex-1'
                  id='mail-compose-to'
                  onChange={(event) =>
                    setComposer((current) =>
                      current
                        ? { ...current, to: event.target.value }
                        : current,
                    )
                  }
                  placeholder={t('workspace.to', { defaultValue: 'TO' })}
                  value={composer.to}
                />
                <div className='flex shrink-0 items-center gap-1'>
                  <Button
                    aria-controls='mail-compose-cc'
                    aria-expanded={ccVisible}
                    aria-pressed={ccVisible}
                    className='h-9 px-1.5 text-sm font-normal text-muted-foreground'
                    onClick={() => setCcVisible((visible) => !visible)}
                    type='button'
                    variant='ghost'
                  >
                    {t('workspace.showCc', { defaultValue: 'Cc' })}
                  </Button>
                  <Button
                    aria-controls='mail-compose-bcc'
                    aria-expanded={bccVisible}
                    aria-pressed={bccVisible}
                    className='h-9 px-1.5 text-sm font-normal text-muted-foreground'
                    onClick={() => setBccVisible((visible) => !visible)}
                    type='button'
                    variant='ghost'
                  >
                    {t('workspace.showBcc', { defaultValue: 'Bcc' })}
                  </Button>
                </div>
              </div>
              {ccVisible ? (
                <Input
                  aria-label={t('workspace.cc', { defaultValue: 'CC' })}
                  id='mail-compose-cc'
                  onChange={(event) =>
                    setComposer((current) =>
                      current
                        ? { ...current, cc: event.target.value }
                        : current,
                    )
                  }
                  placeholder={t('workspace.cc', { defaultValue: 'CC' })}
                  value={composer.cc}
                />
              ) : null}
              {bccVisible ? (
                <Input
                  aria-label={t('workspace.bcc', { defaultValue: 'BCC' })}
                  id='mail-compose-bcc'
                  onChange={(event) =>
                    setComposer((current) =>
                      current
                        ? { ...current, bcc: event.target.value }
                        : current,
                    )
                  }
                  placeholder={t('workspace.bcc', { defaultValue: 'BCC' })}
                  value={composer.bcc}
                />
              ) : null}
            </div>
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
            <MailRichTextEditor
              ariaLabel={t('workspace.messageBodyLabel', {
                defaultValue: 'Message body',
              })}
              insertActions={{
                signature: {
                  label: t('workspace.signature', {
                    defaultValue: 'Signature',
                  }),
                  options: [
                    {
                      id: '',
                      label: t('workspace.defaultSignature', {
                        defaultValue: 'Default signature',
                      }),
                    },
                    {
                      id: '__none__',
                      label: t('workspace.noSignature', {
                        defaultValue: 'No signature',
                      }),
                    },
                    ...signatures.map((signature) => ({
                      id: signature.id,
                      label: signature.name,
                    })),
                  ],
                  onSelect: (nextSignatureId) => {
                    setComposer((current) =>
                      current
                        ? replaceComposerSignature(
                            current,
                            signatures,
                            nextSignatureId,
                          )
                        : current,
                    );
                    setSignatureId(nextSignatureId);
                  },
                  selectedId: signatureId,
                },
                template: {
                  label: t('workspace.template', {
                    defaultValue: 'Template',
                  }),
                  options: templates.map((template) => ({
                    id: template.id,
                    label: template.name,
                  })),
                  onSelect: (templateId) => {
                    const template = templates.find(
                      (item) => item.id === templateId,
                    );
                    if (!template) return;
                    const hasExistingContent = Boolean(
                      composer?.subject.trim() ||
                      composer?.text.trim() ||
                      composer?.html.trim(),
                    );
                    if (
                      hasExistingContent &&
                      !window.confirm(
                        t('workspace.templateReplaceConfirm', {
                          defaultValue:
                            'This replaces the existing subject and message body. Continue?',
                        }),
                      )
                    ) {
                      return;
                    }
                    const rendered = renderMailTemplate(
                      template,
                      templateVariables,
                    );
                    setComposer((current) =>
                      current
                        ? {
                            ...current,
                            subject: rendered.subject,
                            text: rendered.text,
                            html: rendered.html,
                          }
                        : current,
                    );
                  },
                },
              }}
              labels={{
                toolbar: t('workspace.editor.toolbar', {
                  defaultValue: 'Formatting',
                }),
                bold: t('workspace.editor.bold', { defaultValue: 'Bold' }),
                italic: t('workspace.editor.italic', {
                  defaultValue: 'Italic',
                }),
                underline: t('workspace.editor.underline', {
                  defaultValue: 'Underline',
                }),
                bulletList: t('workspace.editor.bulletList', {
                  defaultValue: 'Bulleted list',
                }),
                numberedList: t('workspace.editor.numberedList', {
                  defaultValue: 'Numbered list',
                }),
                undo: t('workspace.editor.undo', { defaultValue: 'Undo' }),
                redo: t('workspace.editor.redo', { defaultValue: 'Redo' }),
                clearFormatting: t('workspace.editor.clearFormatting', {
                  defaultValue: 'Clear formatting',
                }),
                fontSize: t('workspace.editor.fontSize', {
                  defaultValue: 'Font size',
                }),
                heading: t('workspace.editor.heading', {
                  defaultValue: 'Heading level',
                }),
                link: t('workspace.editor.link', {
                  defaultValue: 'Insert link',
                }),
                image: t('workspace.editor.image', {
                  defaultValue: 'Insert image',
                }),
                normal: t('workspace.editor.normal', {
                  defaultValue: 'Normal',
                }),
                heading1: t('workspace.editor.heading1', {
                  defaultValue: 'Heading 1',
                }),
                heading2: t('workspace.editor.heading2', {
                  defaultValue: 'Heading 2',
                }),
                heading3: t('workspace.editor.heading3', {
                  defaultValue: 'Heading 3',
                }),
                heading4: t('workspace.editor.heading4', {
                  defaultValue: 'Heading 4',
                }),
                heading5: t('workspace.editor.heading5', {
                  defaultValue: 'Heading 5',
                }),
                heading6: t('workspace.editor.heading6', {
                  defaultValue: 'Heading 6',
                }),
                fontSizeSmall: t('workspace.editor.fontSizeSmall', {
                  defaultValue: 'Small',
                }),
                fontSizeNormal: t('workspace.editor.fontSizeNormal', {
                  defaultValue: 'Normal',
                }),
                fontSizeLarge: t('workspace.editor.fontSizeLarge', {
                  defaultValue: 'Large',
                }),
              }}
              onChange={(value) =>
                setComposer((current) =>
                  current
                    ? { ...current, text: value.text, html: value.html }
                    : current,
                )
              }
              placeholder={t('workspace.messageBody', {
                defaultValue: 'Write a message…',
              })}
              value={composer.html}
            />
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
                disabled={sending || autoSaving || uploading}
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
                        disabled={sending || autoSaving}
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
                        disabled={sending || autoSaving}
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
            <div className='space-y-2'>
              <label className='flex items-center gap-2 text-sm text-muted-foreground'>
                <input
                  checked={scheduleEnabled}
                  disabled={sending || autoSaving}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setScheduleEnabled(enabled);
                    setDraftSaveStatus('idle');
                    if (!enabled) {
                      setComposer((current) =>
                        current ? { ...current, scheduledAt: '' } : current,
                      );
                    }
                  }}
                  type='checkbox'
                />
                {t('workspace.scheduleSendToggle', {
                  defaultValue: 'Schedule send',
                })}
              </label>
              {scheduleEnabled ? (
                <label
                  className='block space-y-1 text-xs text-muted-foreground'
                  htmlFor='mail-compose-scheduled-at'
                >
                  <span>
                    {t('workspace.scheduledAt', {
                      defaultValue: 'Send later (optional)',
                    })}
                  </span>
                  <Input
                    id='mail-compose-scheduled-at'
                    min={localDateTimeMinimum()}
                    onChange={(event) => {
                      setDraftSaveStatus('idle');
                      setComposer((current) =>
                        current
                          ? { ...current, scheduledAt: event.target.value }
                          : current,
                      );
                    }}
                    type='datetime-local'
                    value={composer.scheduledAt}
                  />
                </label>
              ) : null}
            </div>
            <label className='flex items-center gap-2 text-sm text-muted-foreground'>
              <input
                checked={individualDelivery}
                disabled={
                  composer.mode !== 'new' ||
                  autoSaving ||
                  Boolean(composer.draftMessageId || retainedAttachments.length)
                }
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
          </div>
          <footer className='flex items-center gap-2 border-t px-4 py-3'>
            <span
              className='mr-auto text-xs text-muted-foreground'
              role='status'
            >
              {draftSaveStatus === 'saving'
                ? t('workspace.draftSaving', { defaultValue: 'Saving…' })
                : draftSaveStatus === 'failed'
                  ? t('workspace.draftSaveFailed', {
                      defaultValue: 'Draft not saved',
                    })
                  : composerHasUnsavedChanges
                    ? t('workspace.draftPending', {
                        defaultValue: 'Unsaved changes',
                      })
                    : draftSaveStatus === 'saved'
                      ? t('workspace.draftSaved', {
                          defaultValue: 'Draft saved',
                        })
                      : null}
            </span>
            {composerCanDraft ? (
              <Button
                disabled={!identityId || sending || autoSaving || uploading}
                onClick={saveComposerDraft}
                variant='outline'
              >
                {t('workspace.saveDraft', { defaultValue: 'Save draft' })}
              </Button>
            ) : null}
            <Button
              disabled={sending || autoSaving || uploading}
              onClick={() => closeComposer()}
              variant='outline'
            >
              {t('workspace.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              disabled={
                !composerCanSend ||
                !identityId ||
                !composerHasRequiredContent ||
                sending ||
                autoSaving ||
                uploading
              }
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

function DraftConflictNotice({
  conflict,
  onUseRemote,
}: {
  readonly conflict: MailDraftConflict;
  readonly onUseRemote: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm'
      role='alert'
    >
      <p className='font-medium'>
        {t('workspace.draftConflict.title', {
          defaultValue: 'The remote draft changed while you were editing.',
        })}
      </p>
      <p className='mt-1 text-xs text-muted-foreground'>
        {t('workspace.draftConflict.remoteSummary', {
          defaultValue: 'Remote version: {{subject}}',
          subject: conflict.remote.subject || '(no subject)',
        })}
      </p>
      <details className='mt-2 text-xs'>
        <summary className='cursor-pointer font-medium'>
          {t('workspace.draftConflict.viewRemote', {
            defaultValue: 'View remote version',
          })}
        </summary>
        <div className='mt-2 space-y-1 rounded border bg-background/60 p-2'>
          <p>{conflict.remote.text || conflict.remote.html || '—'}</p>
          {conflict.remote.attachments.length > 0 ? (
            <p className='text-muted-foreground'>
              {t('workspace.draftConflict.attachments', {
                count: conflict.remote.attachments.length,
                defaultValue: '{{count}} remote attachments',
              })}
            </p>
          ) : null}
        </div>
      </details>
      <Button
        className='mt-2'
        onClick={onUseRemote}
        type='button'
        variant='outline'
      >
        {t('workspace.draftConflict.useRemote', {
          defaultValue: 'Discard local changes and use remote',
        })}
      </Button>
    </div>
  );
}

function replaceComposerSignature(
  composer: ComposerState,
  signatures: readonly MailSignature[],
  signatureId: string,
): ComposerState {
  return {
    ...composer,
    ...replaceMailSignatureContent(
      { text: composer.text, html: composer.html },
      signatures,
      signatureId,
    ),
  };
}

function buildComposerInput(
  accountId: string,
  identityId: string,
  signatureId: string,
  composer: ComposerState,
  attachments: readonly MailOutboundAttachmentView[],
  retainedAttachments: MailMessage['attachments'],
): MailComposeInput {
  return {
    accountId,
    identityId,
    signatureId: signatureId === '__none__' ? null : signatureId || undefined,
    to: parseAddressList(composer.to),
    cc: parseAddressList(composer.cc),
    bcc: parseAddressList(composer.bcc),
    subject: composer.subject,
    text: composer.text,
    html: composer.html || undefined,
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

function buildDraftComposerInput(
  accountId: string,
  identityId: string,
  signatureId: string,
  composer: ComposerState,
  attachments: readonly MailOutboundAttachmentView[],
  retainedAttachments: MailMessage['attachments'],
): MailComposeInput {
  return {
    ...buildComposerInput(
      accountId,
      identityId,
      signatureId,
      composer,
      attachments,
      retainedAttachments,
    ),
    scheduledAt: undefined,
  };
}

function mergeProviderDraftBody(
  current: string,
  submitted: string,
  providerValue: string | undefined,
): string {
  if (!providerValue || providerValue === submitted) return current;
  if (!providerValue.startsWith(submitted)) return current;
  const providerSuffix = providerValue.slice(submitted.length);
  return current.endsWith(providerSuffix)
    ? current
    : `${current}${providerSuffix}`;
}

function composerFingerprint(
  composer: ComposerState,
  identityId: string,
  signatureId: string,
  attachments: readonly MailOutboundAttachmentView[],
  retainedAttachments: MailMessage['attachments'],
): string {
  return JSON.stringify({
    mode: composer.mode,
    relatedMessageId: composer.relatedMessageId,
    fromAddress: composer.fromAddress,
    to: composer.to,
    cc: composer.cc,
    bcc: composer.bcc,
    subject: composer.subject,
    text: composer.text,
    html: composer.html,
    identityId,
    signatureId,
    attachmentIds: attachments.map((attachment) => attachment.id),
    retainedAttachmentIds: retainedAttachments.map(
      (attachment) => attachment.id,
    ),
  });
}

function readComposerRecovery(
  accountId: string,
): ComposerRecoverySnapshot | undefined {
  try {
    const raw = window.sessionStorage.getItem(composerRecoveryKey(accountId));
    if (!raw) return undefined;
    const snapshot: unknown = JSON.parse(raw);
    if (
      !isComposerRecoverySnapshot(snapshot) ||
      snapshot.accountId !== accountId ||
      !hasRecoveryContent(snapshot)
    ) {
      return undefined;
    }
    return {
      ...snapshot,
      composer: {
        ...snapshot.composer,
        html: sanitizeMailHtml(snapshot.composer.html),
      },
    };
  } catch {
    clearComposerRecovery(accountId);
    return undefined;
  }
}

function hasRecoveryContent(snapshot: ComposerRecoverySnapshot): boolean {
  const { composer } = snapshot;
  return Boolean(
    composer.to.trim() ||
    composer.cc.trim() ||
    composer.bcc.trim() ||
    composer.subject.trim() ||
    composer.text.trim() ||
    composer.scheduledAt ||
    composer.draftMessageId ||
    snapshot.composeAttachments.length ||
    snapshot.retainedAttachments.length,
  );
}

function writeComposerRecovery(snapshot: ComposerRecoverySnapshot): void {
  try {
    window.sessionStorage.setItem(
      composerRecoveryKey(snapshot.accountId),
      JSON.stringify(snapshot),
    );
  } catch {
    // Browser privacy settings or storage pressure can disable recovery.
  }
}

function clearComposerRecovery(accountId: string): void {
  try {
    window.sessionStorage.removeItem(composerRecoveryKey(accountId));
  } catch {
    // Nothing else is required when browser storage is unavailable.
  }
}

function composerRecoveryKey(accountId: string): string {
  return `${COMPOSER_RECOVERY_KEY_PREFIX}${accountId}`;
}

function isComposerRecoverySnapshot(
  value: unknown,
): value is ComposerRecoverySnapshot {
  if (!isRecord(value) || value.version !== 1) return false;
  if (
    typeof value.accountId !== 'string' ||
    typeof value.identityId !== 'string' ||
    (value.signatureId !== undefined &&
      typeof value.signatureId !== 'string') ||
    !isRecord(value.composer) ||
    !Array.isArray(value.composeAttachments) ||
    !value.composeAttachments.every(isRecoveryAttachment) ||
    !Array.isArray(value.retainedAttachments) ||
    !value.retainedAttachments.every(isRecoveryAttachment) ||
    (value.savedFingerprint !== undefined &&
      typeof value.savedFingerprint !== 'string')
  ) {
    return false;
  }
  const composer = value.composer;
  return (
    ['new', 'reply', 'forward', 'edit'].includes(String(composer.mode)) &&
    ['relatedMessageId', 'draftMessageId', 'fromAddress'].every(
      (field) =>
        composer[field] === undefined || typeof composer[field] === 'string',
    ) &&
    ['to', 'cc', 'bcc', 'subject', 'text', 'html', 'scheduledAt'].every(
      (field) => typeof composer[field] === 'string',
    )
  );
}

function isRecoveryAttachment(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.fileName === 'string' &&
    typeof value.contentType === 'string' &&
    typeof value.size === 'number' &&
    Number.isFinite(value.size) &&
    value.size >= 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toBulkComposeInput(input: MailComposeInput): MailBulkComposeInput {
  return {
    accountId: input.accountId,
    identityId: input.identityId,
    signatureId: input.signatureId,
    recipients: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachmentIds: input.attachmentIds,
    scheduledAt: input.scheduledAt,
    idempotencyKey: input.idempotencyKey,
  };
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

function formatIdentity(identity: MailIdentity): string {
  return identity.displayName
    ? `${identity.displayName} <${identity.address}>`
    : identity.address;
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
