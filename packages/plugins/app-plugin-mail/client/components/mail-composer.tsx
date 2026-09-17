import { mailEditorLabels } from '../lib/mail-editor-labels.js';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { useTranslation } from '@nocobase/i18n/client';
import { Paperclip, X } from 'lucide-react';
import {
  type ReactElement,
  type ReactNode,
  useId,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  useMailComposer,
  type MailComposerProps,
} from '../hooks/use-mail-composer.js';
import {
  clearComposerRecovery,
  composerFingerprint,
  formatAddressList,
  formatBytes,
  formatIdentity,
  localDateTimeMinimum,
  replaceComposerSignature,
  type ComposerState,
} from '../lib/mail-composer-state.js';
import { renderMailTemplate } from '../lib/mail-template.js';
import { type MailDraftConflict } from '../mail-client.js';
import { MAIL_PLUGIN_NS } from '../namespace.js';
import { MailRichTextEditor } from './mail-rich-text-editor.js';
import { MailHtmlBody } from './mail-html-body.js';
import { readDraftComposerBody } from '../lib/mail-forward-content.js';
import { Button } from './ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';
import { Input } from './ui/input.js';
import { NativeSelect } from './ui/native-select.js';
export type { MailComposerRequest } from '../hooks/use-mail-composer.js';
export function MailComposer(
  props: MailComposerProps & {
    readonly inline?: boolean;
    readonly active?: boolean;
  },
): ReactElement {
  const fieldId = useId();
  const Surface = props.inline ? 'section' : DialogPrimitive.Popup;
  const Title = props.inline ? 'h2' : DialogPrimitive.Title;
  const { templateVariables } = props;
  const recipientInputRef = useRef<HTMLInputElement>(null);
  const mobile = useSyncExternalStore(
    subscribeToMobileLayout,
    isMobileLayout,
    () => false,
  );
  const {
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
  } = useMailComposer(props);
  const senderOptions =
    props.senderSelection?.options ??
    sendableComposerIdentities.map((identity) => ({
      accountId: composerAccountId,
      identity,
    }));
  return (
    <>
      <ComposerFrame
        inline={props.inline}
        open={Boolean(composer) && props.active !== false}
        modal={mobile}
        disablePointerDismissal
        onOpenChange={(open, event) => {
          if (!open) {
            if (
              event.reason === 'outside-press' ||
              sending ||
              autoSaving ||
              uploading
            ) {
              event.cancel();
              return;
            }
            closeComposer();
          }
        }}
      >
        {composer ? (
          <Surface
            {...(props.inline ? {} : { initialFocus: recipientInputRef })}
            aria-label={t('workspace.composerTitle', {
              defaultValue: 'New message',
            })}
            className={
              props.inline
                ? 'flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-background shadow-sm'
                : 'fixed inset-0 z-50 flex h-svh w-full flex-col overflow-hidden bg-background shadow-2xl outline-none sm:inset-auto sm:right-5 sm:bottom-5 sm:h-auto sm:max-h-[calc(100svh-2.5rem)] sm:w-[min(42rem,calc(100vw-2.5rem))] sm:rounded-2xl sm:border'
            }
          >
            <header className='flex items-center border-b bg-muted/30 px-4 py-3'>
              <Title className='font-semibold'>
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
              </Title>
              {!props.inline ? (
                <Button
                  aria-label={t('workspace.closeComposer', {
                    defaultValue: 'Close composer',
                  })}
                  className='ml-auto size-8 px-0'
                  disabled={sending || autoSaving || uploading}
                  onClick={() => closeComposer()}
                  variant='ghost'
                >
                  <X />
                </Button>
              ) : null}
            </header>
            {error ? (
              <div
                role='alert'
                className='shrink-0 border-b border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive'
              >
                {error}
              </div>
            ) : null}
            <div className='min-h-0 flex-1 space-y-3 overflow-y-auto p-4'>
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
                        setBccVisible(
                          Boolean(recoveryOffer.composer.bcc.trim()),
                        );
                        setScheduleEnabled(
                          Boolean(recoveryOffer.composer.scheduledAt),
                        );
                        setComposeAttachments(recoveryOffer.composeAttachments);
                        setRetainedAttachments(
                          recoveryOffer.retainedAttachments,
                        );
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
                          forwardQuote: undefined,
                          ...readDraftComposerBody(resolved),
                          subject: resolved.subject,
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
                <label className='grid min-w-0 flex-1 gap-2 text-sm font-medium'>
                  {t('workspace.from', { defaultValue: 'From address' })}
                  <NativeSelect
                    disabled={senderOptions.length === 0}
                    onChange={(event) => {
                      const selected = senderOptions.find(
                        ({ accountId, identity }) =>
                          (props.senderSelection
                            ? JSON.stringify([accountId, identity.id])
                            : identity.id) === event.target.value,
                      );
                      if (!selected) return;
                      if (props.senderSelection) {
                        props.senderSelection.onChange(
                          selected.accountId,
                          selected.identity.id,
                        );
                      } else setIdentityId(selected.identity.id);
                    }}
                    value={
                      props.senderSelection && identityId
                        ? JSON.stringify([composerAccountId, identityId])
                        : identityId
                    }
                  >
                    {senderOptions.length === 0 ? (
                      <option value=''>
                        {t('workspace.noSenders', {
                          defaultValue: 'No sendable addresses',
                        })}
                      </option>
                    ) : null}
                    {senderOptions.map(({ accountId, identity }) => (
                      <option
                        key={JSON.stringify([accountId, identity.id])}
                        value={
                          props.senderSelection
                            ? JSON.stringify([accountId, identity.id])
                            : identity.id
                        }
                      >
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
                    id={`${fieldId}-to`}
                    ref={recipientInputRef}
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
                      aria-controls={`${fieldId}-cc`}
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
                      aria-controls={`${fieldId}-bcc`}
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
                    id={`${fieldId}-cc`}
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
                    id={`${fieldId}-bcc`}
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
                aria-label={t('workspace.subject', {
                  defaultValue: 'Subject',
                })}
                onChange={(event) =>
                  setComposer((current) =>
                    current
                      ? { ...current, subject: event.target.value }
                      : current,
                  )
                }
                placeholder={t('workspace.subject', {
                  defaultValue: 'Subject',
                })}
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
                labels={mailEditorLabels(t)}
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
              {composer.forwardQuote ? (
                <section className='rounded-lg border p-3'>
                  <p className='text-sm font-medium text-muted-foreground'>
                    {t('workspace.forwardedMessage', {
                      defaultValue: 'Forwarded message',
                    })}
                  </p>
                  <MailHtmlBody
                    message={composer.forwardQuote}
                    title={t('workspace.forwardedMessage', {
                      defaultValue: 'Forwarded message',
                    })}
                  />
                </section>
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
                          disabled={sending || autoSaving || uploading}
                          onClick={() =>
                            setRetainedAttachments((current) =>
                              current.filter(
                                (item) => item.id !== attachment.id,
                              ),
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
                          disabled={sending || autoSaving || uploading}
                          onClick={() =>
                            setComposeAttachments((current) =>
                              current.filter(
                                (item) => item.id !== attachment.id,
                              ),
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
                    disabled={sending || autoSaving || uploading}
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
                    className='grid gap-2 text-xs text-muted-foreground'
                    htmlFor={`${fieldId}-scheduled-at`}
                  >
                    <span>
                      {t('workspace.scheduledAt', {
                        defaultValue: 'Send later (optional)',
                      })}
                    </span>
                    <Input
                      id={`${fieldId}-scheduled-at`}
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
            </div>
            <footer className='flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-3'>
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
              {!props.inline ? (
                <Button
                  disabled={sending || autoSaving || uploading}
                  onClick={() => closeComposer()}
                  variant='outline'
                >
                  {t('workspace.cancel', { defaultValue: 'Cancel' })}
                </Button>
              ) : null}
              <Button
                disabled={
                  !composerCanSend ||
                  !identityId ||
                  !composerHasRequiredContent ||
                  sending ||
                  autoSaving ||
                  uploading
                }
                onClick={() => sendComposer()}
              >
                {sending
                  ? t('workspace.sending', { defaultValue: 'Sending…' })
                  : composer.scheduledAt
                    ? t('workspace.scheduleSend', {
                        defaultValue: 'Schedule send',
                      })
                    : t('workspace.send', { defaultValue: 'Send' })}
              </Button>
              {props.allowBulkSend ? (
                <Button
                  disabled={
                    !composerCanSend ||
                    !identityId ||
                    !composerHasRequiredContent ||
                    sending ||
                    autoSaving ||
                    uploading ||
                    Boolean(composer.cc.trim() || composer.bcc.trim())
                  }
                  onClick={() => sendComposer('bulk')}
                  variant='outline'
                >
                  {t('dev.sendHub.sendSeparately', {
                    defaultValue: 'Send separately',
                  })}
                </Button>
              ) : null}
              {props.allowBulkSend ? (
                <p className='w-full text-xs text-muted-foreground'>
                  {composer.cc.trim() || composer.bcc.trim()
                    ? t('dev.sendHub.bulkNoCopies', {
                        defaultValue:
                          'Separate sending does not support Cc or Bcc. Clear them to send separately.',
                      })
                    : t('dev.sendHub.bulkHelp', {
                        defaultValue:
                          'Send separately creates an independent message for each recipient (up to 100); duplicate addresses are removed.',
                      })}
                </p>
              ) : null}
            </footer>
          </Surface>
        ) : null}
      </ComposerFrame>
      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent
          closeLabel={t('workspace.keepEditing', {
            defaultValue: 'Keep editing',
          })}
        >
          <DialogHeader>
            <DialogTitle>
              {t('workspace.closeDraftTitle', {
                defaultValue: 'Close this message?',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('workspace.unsavedChangesConfirm', {
                defaultValue:
                  'This message has changes that have not been saved. Close it anyway?',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setConfirmClose(false)}>
              {t('workspace.keepEditing', { defaultValue: 'Keep editing' })}
            </Button>
            <Button variant='destructive' onClick={() => closeComposer(true)}>
              {t('workspace.discardChanges', {
                defaultValue: 'Discard unsaved changes',
              })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
function DraftConflictNotice({
  conflict,
  onUseRemote,
}: {
  readonly conflict: MailDraftConflict;
  readonly onUseRemote: () => void;
}): ReactElement {
  const { t } = useTranslation(MAIL_PLUGIN_NS);
  return (
    <div
      className='rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm'
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

function isMobileLayout(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 639px)').matches
  );
}
function subscribeToMobileLayout(notify: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const media = window.matchMedia('(max-width: 639px)');
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
}

function ComposerFrame({
  inline,
  children,
  ...props
}: DialogPrimitive.Root.Props & {
  readonly inline?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  if (inline) return <>{children}</>;
  return (
    <DialogPrimitive.Root {...props}>
      <DialogPrimitive.Portal>{children}</DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
