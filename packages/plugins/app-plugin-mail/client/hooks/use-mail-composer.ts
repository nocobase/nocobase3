import type { Dispatch, SetStateAction, RefObject } from 'react';
import type { MailClient } from '../mail-client.js';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildComposerInput,
  buildDraftComposerInput,
  clearComposerRecovery,
  composerFingerprint,
  findProviderCapabilities,
  mergeProviderDraftBody,
  parseAddressList,
  readComposerRecovery,
  replaceComposerSignature,
  writeComposerRecovery,
  type ComposerRecoverySnapshot,
  type ComposerState,
} from '../lib/mail-composer-state.js';
import { type MailTemplateVariables } from '../lib/mail-template.js';
import {
  mailErrorMessage,
  type MailAccountView,
  type MailBulkComposeInput,
  type MailIdentity,
  type MailMessage,
  type MailOutboundAttachmentView,
  type MailProviderView,
  type MailSignature,
  type MailTemplate,
} from '../mail-client.js';
import { MAIL_PLUGIN_NS } from '../namespace.js';
import { useMailClient } from '../runtime.js';
export interface MailComposerRequest {
  readonly accountId: string;
  readonly value: ComposerState;
  readonly attachments: MailMessage['attachments'];
}
export interface MailComposerProps {
  readonly allowBulkSend?: boolean;
  readonly senderSelection?: {
    readonly identityId?: string;
    readonly options: readonly {
      readonly accountId: string;
      readonly identity: MailIdentity;
    }[];
    readonly onChange: (accountId: string, identityId: string) => void;
  };
  readonly request: MailComposerRequest;
  readonly accounts: readonly MailAccountView[];
  readonly providers: readonly MailProviderView[];
  readonly templateVariables: MailTemplateVariables;
  readonly onClose: () => void;
  readonly onComplete: (
    result: 'accepted' | 'draft' | 'unknown' | 'failed' | 'partial',
    rejectedRecipients?: readonly string[],
  ) => void;
}

const AUTO_SAVE_DELAY_MS = 1_000;
export function useMailComposer({
  request,
  allowBulkSend = false,
  senderSelection,
  accounts,
  providers,
  onClose,
  onComplete,
}: MailComposerProps): MailComposerController {
  const { t } = useTranslation(MAIL_PLUGIN_NS);
  const mail = useMailClient();
  const [error, setError] = useState<string>();
  const [confirmClose, setConfirmClose] = useState(false);
  const [initialRecovery] = useState(() =>
    request.value.mode === 'new'
      ? readComposerRecovery(request.accountId)
      : undefined,
  );
  const [composer, setComposer] = useState<ComposerState | undefined>(
    request.value,
  );
  const composerAccountId = request.accountId;
  const [composerIdentities, setComposerIdentities] = useState<
    readonly MailIdentity[]
  >([]);
  const [localIdentityId, setLocalIdentityId] = useState('');
  const identityId = senderSelection?.identityId ?? localIdentityId;
  const setIdentityId = (id: string): void => {
    if (senderSelection) senderSelection.onChange(composerAccountId, id);
    else setLocalIdentityId(id);
  };
  const [ccVisible, setCcVisible] = useState(Boolean(request.value.cc.trim()));
  const [bccVisible, setBccVisible] = useState(
    Boolean(request.value.bcc.trim()),
  );
  const [scheduleEnabled, setScheduleEnabled] = useState(
    Boolean(request.value.scheduledAt),
  );
  const [signatures, setSignatures] = useState<readonly MailSignature[]>([]);
  const [signatureId, setSignatureId] = useState(
    initialRecovery?.signatureId ?? '',
  );
  const [sending, setSending] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'failed'
  >('idle');
  const [recoveryOffer, setRecoveryOffer] = useState<
    ComposerRecoverySnapshot | undefined
  >(initialRecovery);
  const [templates, setTemplates] = useState<readonly MailTemplate[]>([]);
  const [uploading, setUploading] = useState(false);
  const [composeAttachments, setComposeAttachments] = useState<
    readonly MailOutboundAttachmentView[]
  >([]);
  const [retainedAttachments, setRetainedAttachments] = useState<
    ReadonlyArray<MailMessage['attachments'][number]>
  >(request.attachments);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const draftMessageIdRef = useRef<string | undefined>(
    request.value.draftMessageId,
  );
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState<
    string | undefined
  >(() => composerFingerprint(request.value, '', '', [], request.attachments));
  const failedFingerprintRef = useRef<string | undefined>(undefined);
  const composerSessionRef = useRef(0);
  const bulkRequestRef = useRef<
    { fingerprint: string; key: string } | undefined
  >(undefined);
  const sendRequestRef = useRef<
    | {
        fingerprint: string;
        input: ReturnType<typeof buildComposerInput>;
      }
    | undefined
  >(undefined);
  const copiedAttachmentsRef = useRef(new Map<string, string>());
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
  const composerCanSend = Boolean(
    composerAccount?.status === 'active' && composerProviderCapabilities?.send,
  );
  const composerCanDraft = Boolean(
    composerAccount?.status === 'active' && composerProviderCapabilities?.send,
  );
  useEffect(() => {
    let active = true;
    const next = request.value;
    const existingAttachments = request.attachments;
    const targetAccountId = request.accountId;
    const recovery = initialRecovery;
    void mail.listTemplates().then(
      (items) => {
        if (active) setTemplates(items);
      },
      (cause: unknown) => {
        if (active) requestError(cause);
      },
    );
    void mail.listSignatures(targetAccountId).then(
      (items) => {
        if (!active) return;
        setSignatures(items);
        if (recovery?.signatureId) return;
        const defaultSignatureId =
          items.find((item) => item.isDefault)?.id ?? '';
        setSignatureId(defaultSignatureId);
        if (next.mode !== 'edit' && !next.text.trim() && !next.html.trim()) {
          setComposer((current) =>
            current
              ? replaceComposerSignature(current, items, defaultSignatureId)
              : current,
          );
        }
      },
      (cause: unknown) => {
        if (active) requestError(cause);
      },
    );
    void mail.listIdentities(targetAccountId).then(
      (items) => {
        if (!active) return;
        setComposerIdentities(items);
        const nextIdentityId =
          items.find(
            (identity) =>
              identity.canSend && identity.id === recovery?.identityId,
          )?.id ??
          items.find(
            (identity) =>
              identity.canSend &&
              identity.address.toLowerCase() ===
                next.fromAddress?.toLowerCase(),
          )?.id ??
          items.find((identity) => identity.isPrimary && identity.canSend)
            ?.id ??
          items.find((identity) => identity.canSend)?.id ??
          '';
        setLocalIdentityId(nextIdentityId);
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
      },
      (cause: unknown) => {
        if (active) requestError(cause);
      },
    );
    return () => {
      active = false;
      composerSessionRef.current += 1;
    };
  }, [initialRecovery, mail, request, requestError]);
  const closeComposer = (force = false): void => {
    if (!force && (sending || autoSaving || uploading)) return;
    if (!force && composerHasUnsavedChanges) {
      setConfirmClose(true);
      return;
    }
    composerSessionRef.current += 1;
    clearComposerRecovery(composerAccountId);
    setComposer(undefined);
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
    onClose();
  };

  const sendComposer = (mode: 'normal' | 'bulk' = 'normal'): void => {
    if (
      !composer ||
      !composerAccountId ||
      !identityId ||
      !composerCanSend ||
      sending ||
      autoSaving ||
      uploading ||
      (mode === 'bulk' && !allowBulkSend)
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
    if (
      !composer.text.trim() &&
      !composer.forwardQuote?.text.trim() &&
      !composer.forwardQuote?.html.trim()
    ) {
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
    const seenRecipients = new Set<string>();
    const recipients = to.filter((recipient) => {
      const address = recipient.address.toLowerCase();
      if (seenRecipients.has(address)) return false;
      seenRecipients.add(address);
      return true;
    });
    if (mode === 'bulk') {
      if (composer.cc.trim() || composer.bcc.trim()) {
        setError(
          t('dev.sendHub.bulkNoCopies', {
            defaultValue:
              'Separate sending does not support Cc or Bcc. Clear them to send separately.',
          }),
        );
        return;
      }
      if (
        recipients.some(
          (recipient) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(recipient.address),
        )
      ) {
        setError(
          t('dev.bulkSend.invalidRecipient', {
            defaultValue:
              'Remove or correct invalid recipient addresses first.',
          }),
        );
        return;
      }
      if (recipients.length > 100) {
        setError(
          t('dev.bulkSend.tooManyRecipients', {
            defaultValue: 'Bulk sending supports at most 100 recipients.',
          }),
        );
        return;
      }
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
    const sendBulk = async () => {
      // Each recipient must own its delivery; sending the shared provider draft
      // would consume it on the first message and break the rest of the batch.
      const attachmentIds = [...(input.attachmentIds ?? [])];
      for (const attachment of retainedAttachments) {
        const cachedId =
          attachment.outboundAttachmentId ??
          copiedAttachmentsRef.current.get(attachment.id);
        if (cachedId) {
          attachmentIds.push(cachedId);
          continue;
        }
        const stream = await mail.downloadAttachment(
          composerAccountId,
          input.draftMessageId ?? attachment.messageId,
          attachment.id,
        );
        const blob = await new Response(stream).blob();
        const uploaded = await mail.uploadAttachment(
          new File([blob], attachment.fileName, {
            type: attachment.contentType,
          }),
        );
        copiedAttachmentsRef.current.set(attachment.id, uploaded.id);
        attachmentIds.push(uploaded.id);
      }
      const bulkInput: Omit<MailBulkComposeInput, 'idempotencyKey'> = {
        accountId: input.accountId,
        identityId: input.identityId,
        signatureId: input.signatureId,
        recipients,
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachmentIds: [...new Set(attachmentIds)],
        scheduledAt: input.scheduledAt,
      };
      const fingerprint = JSON.stringify(bulkInput);
      if (bulkRequestRef.current?.fingerprint !== fingerprint) {
        bulkRequestRef.current = { fingerprint, key: input.idempotencyKey };
      }
      return mail.sendBulk({
        ...bulkInput,
        idempotencyKey: bulkRequestRef.current.key,
      });
    };
    const sendSingle = () => {
      // Autosave can replace upload IDs with draft attachment IDs. Compare the
      // logical content, then reuse the original wire request after a lost response.
      const fingerprint = JSON.stringify({
        ...input,
        idempotencyKey: undefined,
        draftMessageId: undefined,
        attachmentIds: [
          ...new Set([
            ...(input.attachmentIds ?? []),
            ...retainedAttachments.map(
              (attachment) =>
                attachment.outboundAttachmentId ??
                attachment.providerAttachmentId,
            ),
          ]),
        ].sort(),
        retainedAttachmentIds: undefined,
      });
      if (sendRequestRef.current?.fingerprint !== fingerprint) {
        sendRequestRef.current = { fingerprint, input };
      }
      return mail
        .sendMessage(sendRequestRef.current.input)
        .then((result) => [result]);
    };
    const operation = mode === 'bulk' ? sendBulk() : sendSingle();
    void operation
      .then((results) => {
        const rejectedRecipients = results.flatMap(
          (result) => result.error?.recipients?.rejected ?? [],
        );
        const outcome = results.some((result) => result.status === 'unknown')
          ? 'unknown'
          : results.some((result) => result.status === 'failed')
            ? 'failed'
            : rejectedRecipients.length > 0
              ? 'partial'
              : 'accepted';
        closeComposer(true);
        onComplete(outcome, rejectedRecipients);
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
        onComplete('draft');
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
  const composerHasRequiredContent = Boolean(
    composer?.subject.trim() &&
    composer &&
    (composer.text.trim() ||
      composer.forwardQuote?.text.trim() ||
      composer.forwardQuote?.html.trim()) &&
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
            text: snapshot.forwardQuote
              ? snapshot.text
              : mergeProviderDraftBody(
                  snapshot.text,
                  snapshot.text,
                  draft.text,
                ),
            html: snapshot.forwardQuote
              ? snapshot.html
              : mergeProviderDraftBody(
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
                  text: snapshot.forwardQuote
                    ? current.text
                    : mergeProviderDraftBody(
                        current.text,
                        snapshot.text,
                        draft.text,
                      ),
                  html: snapshot.forwardQuote
                    ? current.html
                    : mergeProviderDraftBody(
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

  return {
    t,
    mail,
    error,
    setError,
    confirmClose,
    setConfirmClose,
    composer,
    setComposer,
    composerAccountId,
    identityId,
    setIdentityId,
    ccVisible,
    setCcVisible,
    bccVisible,
    setBccVisible,
    scheduleEnabled,
    setScheduleEnabled,
    signatures,
    signatureId,
    setSignatureId,
    sending,
    setSending,
    autoSaving,
    draftSaveStatus,
    setDraftSaveStatus,
    recoveryOffer,
    setRecoveryOffer,
    templates,
    uploading,
    composeAttachments,
    setComposeAttachments,
    retainedAttachments,
    setRetainedAttachments,
    attachmentInputRef,
    draftMessageIdRef,
    setLastSavedFingerprint,
    composerSessionRef,
    requestError,
    sendableComposerIdentities,
    composerCanSend,
    composerCanDraft,
    closeComposer,
    sendComposer,
    saveComposerDraft,
    uploadComposerAttachments,
    currentComposerFingerprint,
    composerHasRequiredContent,
    composerHasUnsavedChanges,
  };
}

export interface MailComposerController {
  readonly t: ReturnType<typeof useTranslation>['t'];
  readonly mail: MailClient;
  readonly error: string | undefined;
  readonly setError: Dispatch<SetStateAction<string | undefined>>;
  readonly confirmClose: boolean;
  readonly setConfirmClose: Dispatch<SetStateAction<boolean>>;
  readonly composer: ComposerState | undefined;
  readonly setComposer: Dispatch<SetStateAction<ComposerState | undefined>>;
  readonly composerAccountId: string;
  readonly identityId: string;
  readonly setIdentityId: (id: string) => void;
  readonly ccVisible: boolean;
  readonly setCcVisible: Dispatch<SetStateAction<boolean>>;
  readonly bccVisible: boolean;
  readonly setBccVisible: Dispatch<SetStateAction<boolean>>;
  readonly scheduleEnabled: boolean;
  readonly setScheduleEnabled: Dispatch<SetStateAction<boolean>>;
  readonly signatures: readonly MailSignature[];
  readonly signatureId: string;
  readonly setSignatureId: Dispatch<SetStateAction<string>>;
  readonly sending: boolean;
  readonly setSending: Dispatch<SetStateAction<boolean>>;
  readonly autoSaving: boolean;
  readonly draftSaveStatus: 'idle' | 'saving' | 'saved' | 'failed';
  readonly setDraftSaveStatus: Dispatch<
    SetStateAction<'idle' | 'saving' | 'saved' | 'failed'>
  >;
  readonly recoveryOffer: ComposerRecoverySnapshot | undefined;
  readonly setRecoveryOffer: Dispatch<
    SetStateAction<ComposerRecoverySnapshot | undefined>
  >;
  readonly templates: readonly MailTemplate[];
  readonly uploading: boolean;
  readonly composeAttachments: readonly MailOutboundAttachmentView[];
  readonly setComposeAttachments: Dispatch<
    SetStateAction<readonly MailOutboundAttachmentView[]>
  >;
  readonly retainedAttachments: MailMessage['attachments'];
  readonly setRetainedAttachments: Dispatch<
    SetStateAction<MailMessage['attachments']>
  >;
  readonly attachmentInputRef: RefObject<HTMLInputElement | null>;
  readonly draftMessageIdRef: RefObject<string | undefined>;
  readonly setLastSavedFingerprint: Dispatch<
    SetStateAction<string | undefined>
  >;
  readonly composerSessionRef: RefObject<number>;
  readonly requestError: (cause: unknown) => void;
  readonly sendableComposerIdentities: MailIdentity[];
  readonly composerCanSend: boolean;
  readonly composerCanDraft: boolean;
  readonly closeComposer: (force?: boolean) => void;
  readonly sendComposer: (mode?: 'normal' | 'bulk') => void;
  readonly saveComposerDraft: () => void;
  readonly uploadComposerAttachments: (files: FileList | null) => void;
  readonly currentComposerFingerprint: string | undefined;
  readonly composerHasRequiredContent: boolean;
  readonly composerHasUnsavedChanges: boolean;
}
