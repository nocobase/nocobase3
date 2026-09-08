import { Paperclip, PenLine, RefreshCw, Search, Tag, X } from 'lucide-react';
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
  type MailSignature,
  type MailOutboundAttachmentView,
  type MailSyncRunView,
  type MailTemplate,
} from '../mail-client.js';
import { getMailClient } from '../runtime.js';

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
const AUTO_SAVE_DELAY_MS = 1_000;

export default function MailWorkspacePage({
  templateVariables = {},
}: MailWorkspacePageProps = {}): ReactElement {
  const { t } = useTranslation();
  const [mail] = useState(getMailClient);
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
  }, [mail, requestError]);

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
  }, [finishSync, mail, requestError, syncRun]);

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
  }, [accountId, mail, reloadVersion, requestError]);

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
  }, [accountId, mail, messageQuery, reloadVersion, requestError]);

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

  const createLabel = (): void => {
    if (!accountId) return;
    const name = window.prompt(
      t('workspace.newLabelPrompt', { defaultValue: 'Label name' }),
    );
    if (!name?.trim()) return;
    setError(undefined);
    void mail
      .createLabel(accountId, name)
      .then((label) => setFolders((current) => [...current, label]))
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
  ): void => {
    if (!accountId) return;
    const recovery =
      next.mode === 'new' ? readComposerRecovery(accountId) : undefined;
    composerSessionRef.current += 1;
    draftMessageIdRef.current = next.draftMessageId;
    setLastSavedFingerprint(
      composerFingerprint(next, '', '', [], existingAttachments),
    );
    failedFingerprintRef.current = undefined;
    setRecoveryOffer(recovery);
    setDraftSaveStatus('idle');
    setComposer(next);
    setSignatures([]);
    setSignatureId(recovery?.signatureId ?? '');
    setComposeAttachments([]);
    setRetainedAttachments(existingAttachments);
    setIndividualDelivery(false);
    setError(undefined);
    void mail.listTemplates().then(setTemplates, requestError);
    void mail.listIdentities(accountId).then((items) => {
      setIdentities(items);
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
      if (nextIdentityId) {
        void mail.listSignatures(accountId, nextIdentityId).then((items) => {
          setSignatures(items);
          if (!recovery?.signatureId) {
            setSignatureId(items.find((item) => item.isDefault)?.id ?? '');
          }
        }, requestError);
      }
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
    clearComposerRecovery(accountId);
    setComposer(undefined);
    setRecoveryOffer(undefined);
    setComposeAttachments([]);
    setRetainedAttachments([]);
    setSignatures([]);
    setSignatureId('');
    setDraftSaveStatus('idle');
  };

  const sendComposer = (): void => {
    if (!composer || !accountId || !identityId || sending || autoSaving) return;
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
          void mail.deleteMessage(accountId, draftId, true).catch(requestError);
        }
      })
      .catch(requestError)
      .finally(() => setSending(false));
  };

  const saveComposerDraft = (): void => {
    if (!composer || !accountId || !identityId || sending || autoSaving) return;
    setSending(true);
    setError(undefined);
    void mail
      .saveDraft(
        buildDraftComposerInput(
          accountId,
          identityId,
          signatureId,
          composer,
          composeAttachments,
          retainedAttachments,
        ),
      )
      .then((draft) => {
        draftMessageIdRef.current = draft.id;
        clearComposerRecovery(accountId);
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
  const composerHasUnsavedChanges = Boolean(
    composer &&
    (currentComposerFingerprint !== lastSavedFingerprint ||
      composer.scheduledAt),
  );

  useEffect(() => {
    if (!composer || !accountId || !currentComposerFingerprint) return;
    if (recoveryOffer) return;
    if (!composerHasContent && !composer.draftMessageId) {
      clearComposerRecovery(accountId);
      return;
    }
    writeComposerRecovery({
      version: 1,
      accountId,
      identityId,
      signatureId,
      composer,
      composeAttachments,
      retainedAttachments,
      savedFingerprint: lastSavedFingerprint,
    });
  }, [
    accountId,
    composeAttachments,
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
      !accountId ||
      !identityId ||
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
            accountId,
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
    accountId,
    autoSaving,
    composeAttachments,
    composer,
    composerHasContent,
    currentComposerFingerprint,
    identityId,
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
        {accounts.find((account) => account.id === accountId)?.provider.type ===
        'gmail' ? (
          <Button onClick={createLabel} type='button' variant='outline'>
            <Tag aria-hidden='true' className='size-4' />
            {t('workspace.newLabel', { defaultValue: 'New label' })}
          </Button>
        ) : null}
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
            availableLabels={folders}
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
                    html:
                      message.html ?? plainTextToMailHtml(message.text ?? ''),
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
              toggleLabel: (message, labelId, assigned) =>
                mutateMessage(
                  mail.updateMessageLabels({
                    accountId: message.accountId,
                    messageId: message.id,
                    addLabelIds: assigned ? [labelId] : [],
                    removeLabelIds: assigned ? [] : [labelId],
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
                      clearComposerRecovery(accountId);
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
            <NativeSelect
              aria-label={t('workspace.from', { defaultValue: 'From' })}
              onChange={(event) => {
                const nextIdentityId = event.target.value;
                setIdentityId(nextIdentityId);
                setSignatures([]);
                setSignatureId('');
                if (nextIdentityId) {
                  void mail
                    .listSignatures(accountId, nextIdentityId)
                    .then((items) => {
                      setSignatures(items);
                      setSignatureId(
                        items.find((item) => item.isDefault)?.id ?? '',
                      );
                    }, requestError);
                }
              }}
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
            {signatures.length > 0 ? (
              <NativeSelect
                aria-label={t('workspace.signature', {
                  defaultValue: 'Signature',
                })}
                onChange={(event) => setSignatureId(event.target.value)}
                value={signatureId}
              >
                <option value=''>
                  {t('workspace.defaultSignature', {
                    defaultValue: 'Default signature',
                  })}
                </option>
                <option value='__none__'>
                  {t('workspace.noSignature', {
                    defaultValue: 'No signature',
                  })}
                </option>
                {signatures.map((signature) => (
                  <option key={signature.id} value={signature.id}>
                    {signature.name}
                  </option>
                ))}
              </NativeSelect>
            ) : null}
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
            <MailRichTextEditor
              ariaLabel={t('workspace.messageBodyLabel', {
                defaultValue: 'Message body',
              })}
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
            <label className='block space-y-1 text-xs text-muted-foreground'>
              <span>
                {t('workspace.scheduledAt', {
                  defaultValue: 'Send later (optional)',
                })}
              </span>
              <Input
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
            <Button
              disabled={!identityId || sending || autoSaving || uploading}
              onClick={saveComposerDraft}
              variant='outline'
            >
              {t('workspace.saveDraft', { defaultValue: 'Save draft' })}
            </Button>
            <Button
              disabled={sending || autoSaving || uploading}
              onClick={() => closeComposer()}
              variant='outline'
            >
              {t('workspace.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              disabled={!identityId || sending || autoSaving || uploading}
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
