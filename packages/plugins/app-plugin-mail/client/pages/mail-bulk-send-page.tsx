import { ArrowLeft, Paperclip, RefreshCw, Send, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { MailDevPageShell, MailRichTextEditor } from '../components/index.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { NativeSelect } from '../components/ui/native-select.js';
import { Textarea } from '../components/ui/textarea.js';
import {
  mailErrorMessage,
  type MailAccountView,
  type MailAddress,
  type MailIdentity,
  type MailOutboundAttachmentView,
  type MailSignature,
  type MailSubmissionStatus,
  type MailSubmissionView,
  type MailTemplate,
} from '../mail-client.js';
import { getMailClient } from '../runtime.js';
import { renderMailTemplate } from '../lib/mail-template.js';
import { replaceMailSignatureContent } from '../lib/mail-signature.js';

const mail = getMailClient();

interface ParsedRecipients {
  readonly valid: readonly MailAddress[];
  readonly invalid: readonly string[];
  readonly duplicateCount: number;
}

interface BulkResultRow {
  readonly recipient: MailAddress;
  readonly submission: MailSubmissionView;
}

export default function MailBulkSendPage(): ReactElement {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<readonly MailAccountView[]>([]);
  const [accountId, setAccountId] = useState('');
  const [identities, setIdentities] = useState<readonly MailIdentity[]>([]);
  const [identityId, setIdentityId] = useState('');
  const [signatures, setSignatures] = useState<readonly MailSignature[]>([]);
  const [signatureId, setSignatureId] = useState('');
  const [templates, setTemplates] = useState<readonly MailTemplate[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const bodyHtmlRef = useRef('');
  const bodyTextRef = useRef('');
  const [attachments, setAttachments] = useState<
    readonly MailOutboundAttachmentView[]
  >([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState<'loading' | 'uploading' | 'sending'>();
  const [error, setError] = useState<string>();
  const [results, setResults] = useState<readonly BulkResultRow[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const parsedRecipients = useMemo(
    () => parseRecipients(recipientInput),
    [recipientInput],
  );
  const sendableIdentities = useMemo(
    () => identities.filter((identity) => identity.canSend),
    [identities],
  );
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId),
    [accountId, accounts],
  );
  const selectedIdentity = useMemo(
    () => identities.find((identity) => identity.id === identityId),
    [identities, identityId],
  );
  const selectedSignature = useMemo(
    () => signatures.find((signature) => signature.id === signatureId),
    [signatureId, signatures],
  );
  const failedRecipients = useMemo(
    () =>
      results
        .filter((row) => row.submission.status === 'failed')
        .map((row) => row.recipient),
    [results],
  );

  const reportError = useCallback(
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
    setBusy('loading');
    setError(undefined);
    void mail
      .listAccounts()
      .then((nextAccounts) => {
        setAccounts(nextAccounts);
        setAccountId((current) =>
          nextAccounts.some((account) => account.id === current)
            ? current
            : (nextAccounts[0]?.id ?? ''),
        );
      })
      .catch(reportError)
      .finally(() => setBusy(undefined));
  }, [reportError]);

  useEffect(() => {
    void Promise.resolve().then(loadAccounts);
  }, [loadAccounts]);

  useEffect(() => {
    let active = true;
    if (!accountId) {
      void Promise.resolve().then(() => {
        if (!active) return;
        setIdentities([]);
        setSignatures([]);
        setIdentityId('');
        setSignatureId('');
      });
      return () => {
        active = false;
      };
    }
    void Promise.all([
      mail.listIdentities(accountId),
      mail.listSignatures(accountId),
    ])
      .then(([nextIdentities, nextSignatures]) => {
        if (!active) return;
        setIdentities(nextIdentities);
        setSignatures(nextSignatures);
        setIdentityId(
          nextIdentities.find(
            (identity) => identity.isPrimary && identity.canSend,
          )?.id ??
            nextIdentities.find((identity) => identity.canSend)?.id ??
            '',
        );
        const nextSignatureId =
          nextSignatures.find((signature) => signature.isDefault)?.id ?? '';
        setSignatureId(nextSignatureId);
        const currentBody = {
          text: bodyTextRef.current,
          html: bodyHtmlRef.current,
        };
        if (!currentBody.text.trim() && !currentBody.html.trim()) {
          const nextBody = replaceMailSignatureContent(
            currentBody,
            nextSignatures,
            nextSignatureId,
          );
          bodyTextRef.current = nextBody.text;
          bodyHtmlRef.current = nextBody.html;
          setBodyText(nextBody.text);
          setBodyHtml(nextBody.html);
        }
      })
      .catch((cause: unknown) => {
        if (active) reportError(cause);
      });
    return () => {
      active = false;
    };
  }, [accountId, reportError]);

  useEffect(() => {
    void mail.listTemplates().then(setTemplates).catch(reportError);
  }, [reportError]);

  const removeRecipient = (address: string): void => {
    const next = parsedRecipients.valid.filter(
      (recipient) => recipient.address.toLowerCase() !== address.toLowerCase(),
    );
    setRecipientInput(next.map((recipient) => recipient.address).join('\n'));
  };

  const clearRecipients = (): void => {
    setRecipientInput('');
  };

  const selectTemplate = (templateId: string): void => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    if (
      (subject.trim() || bodyText.trim()) &&
      !window.confirm(
        t('dev.bulkSend.templateConfirm', {
          defaultValue:
            'This replaces the existing subject and message body. Continue?',
        }),
      )
    ) {
      return;
    }
    const rendered = renderMailTemplate(template);
    bodyTextRef.current = rendered.text;
    bodyHtmlRef.current = rendered.html ?? '';
    setSubject(rendered.subject);
    setBodyText(rendered.text);
    setBodyHtml(rendered.html ?? '');
  };

  const uploadAttachments = (files: FileList | null): void => {
    if (!files?.length || busy) return;
    setBusy('uploading');
    setError(undefined);
    void Promise.all([...files].map((file) => mail.uploadAttachment(file)))
      .then((uploaded) =>
        setAttachments((current) => [...current, ...uploaded]),
      )
      .catch(reportError)
      .finally(() => {
        setBusy(undefined);
        if (attachmentInputRef.current) attachmentInputRef.current.value = '';
      });
  };

  const submitBulk = (
    recipients: readonly MailAddress[],
    isRetry: boolean,
  ): void => {
    if (
      !accountId ||
      !identityId ||
      !subject.trim() ||
      !bodyText.trim() ||
      recipients.length === 0 ||
      busy
    ) {
      return;
    }
    setBusy('sending');
    setError(undefined);
    void mail
      .sendBulk({
        accountId,
        identityId,
        signatureId:
          signatureId === '__none__' ? null : signatureId || undefined,
        recipients,
        subject,
        text: bodyText,
        html: bodyHtml || undefined,
        attachmentIds: attachments.map((attachment) => attachment.id),
        scheduledAt: scheduledAt
          ? new Date(scheduledAt).toISOString()
          : undefined,
        idempotencyKey: `bulk-page-${globalThis.crypto.randomUUID()}`,
      })
      .then((submissions) => {
        const nextRows = submissions.map((submission, index) => ({
          recipient: recipients[index] ?? { address: 'unknown' },
          submission,
        }));
        setResults((current) =>
          isRetry
            ? current.map(
                (row) =>
                  nextRows.find(
                    (next) =>
                      next.recipient.address.toLowerCase() ===
                      row.recipient.address.toLowerCase(),
                  ) ?? row,
              )
            : nextRows,
        );
        setReviewing(false);
      })
      .catch(reportError)
      .finally(() => setBusy(undefined));
  };

  const reviewBulk = (): void => {
    if (!accountId || !identityId) {
      setError(
        t('dev.bulkSend.accountRequired', {
          defaultValue: 'Select an account and a sender address.',
        }),
      );
      return;
    }
    if (parsedRecipients.valid.length === 0) {
      setError(
        t('dev.bulkSend.recipientRequired', {
          defaultValue: 'Add at least one valid recipient.',
        }),
      );
      return;
    }
    if (parsedRecipients.invalid.length > 0) {
      setError(
        t('dev.bulkSend.invalidRecipient', {
          defaultValue: 'Remove or correct invalid recipient addresses first.',
        }),
      );
      return;
    }
    if (parsedRecipients.valid.length > 100) {
      setError(
        t('dev.bulkSend.tooManyRecipients', {
          defaultValue: 'Bulk sending supports at most 100 recipients.',
        }),
      );
      return;
    }
    if (!subject.trim() || !bodyText.trim()) {
      setError(
        t('dev.bulkSend.contentRequired', {
          defaultValue: 'Add a subject and message body first.',
        }),
      );
      return;
    }
    setError(undefined);
    setReviewing(true);
  };

  return (
    <MailDevPageShell
      actions={
        <Button
          disabled={busy === 'loading'}
          onClick={loadAccounts}
          variant='outline'
        >
          <RefreshCw aria-hidden='true' className='size-4' />
          {t('actions.reloadAccounts', { defaultValue: 'Reload accounts' })}
        </Button>
      }
      badge={t('nav.dev', { defaultValue: 'Mail components' })}
      category={t('dev.bulkSend.category', { defaultValue: 'Operations' })}
      description={t('dev.bulkSend.description', {
        defaultValue:
          'Create one independent submission for each recipient and review every result.',
      })}
      title={t('dev.bulkSend.title', { defaultValue: 'Bulk send' })}
    >
      <div className='mx-auto max-w-5xl space-y-5 pb-12'>
        {error ? (
          <div className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>
            {error}
          </div>
        ) : null}

        {reviewing ? (
          <ReviewCard
            account={selectedAccount}
            attachments={attachments}
            body={bodyText}
            identity={selectedIdentity}
            onBack={() => setReviewing(false)}
            onConfirm={() => submitBulk(parsedRecipients.valid, false)}
            recipients={parsedRecipients.valid}
            scheduledAt={scheduledAt}
            sending={busy === 'sending'}
            subject={subject}
            t={t}
          />
        ) : (
          <Card className='rounded-2xl bg-background p-6 shadow-sm'>
            <div className='grid gap-4 md:grid-cols-2'>
              <label className='text-sm font-medium'>
                {t('dev.account', { defaultValue: 'Account' })}
                <NativeSelect
                  className='mt-1'
                  onChange={(event) => setAccountId(event.target.value)}
                  value={accountId}
                >
                  {accounts.length === 0 ? (
                    <option value=''>
                      {t('dev.noAccounts', {
                        defaultValue: 'No connected accounts',
                      })}
                    </option>
                  ) : null}
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.address}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className='text-sm font-medium'>
                {t('dev.bulkSend.sender', { defaultValue: 'From address' })}
                <NativeSelect
                  className='mt-1'
                  disabled={sendableIdentities.length === 0}
                  onChange={(event) => setIdentityId(event.target.value)}
                  value={identityId}
                >
                  {sendableIdentities.length === 0 ? (
                    <option value=''>
                      {t('dev.bulkSend.noSenders', {
                        defaultValue: 'No sendable addresses',
                      })}
                    </option>
                  ) : null}
                  {sendableIdentities.map((identity) => (
                    <option key={identity.id} value={identity.id}>
                      {formatIdentity(identity)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </div>

            <div className='mt-5 space-y-2'>
              <div className='flex items-center justify-between gap-2'>
                <label
                  className='text-sm font-medium'
                  htmlFor='bulk-recipients'
                >
                  {t('dev.bulkSend.recipients', { defaultValue: 'Recipients' })}
                </label>
                <Button
                  disabled={!recipientInput}
                  onClick={clearRecipients}
                  type='button'
                  variant='ghost'
                >
                  {t('dev.bulkSend.clearRecipients', { defaultValue: 'Clear' })}
                </Button>
              </div>
              <Textarea
                aria-label={t('dev.bulkSend.recipients', {
                  defaultValue: 'Recipients',
                })}
                id='bulk-recipients'
                onChange={(event) => setRecipientInput(event.target.value)}
                placeholder={t('dev.bulkSend.recipientPlaceholder', {
                  defaultValue:
                    'One address per line, or separate with commas or semicolons',
                })}
                value={recipientInput}
              />
              <div className='flex flex-wrap gap-2 text-xs text-muted-foreground'>
                <span>{parsedRecipients.valid.length}/100 valid</span>
                {parsedRecipients.duplicateCount ? (
                  <span>
                    {parsedRecipients.duplicateCount}{' '}
                    {t('dev.bulkSend.duplicatesRemoved', {
                      defaultValue: 'duplicates removed',
                    })}
                  </span>
                ) : null}
              </div>
              {parsedRecipients.invalid.length ? (
                <ul className='space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'>
                  {parsedRecipients.invalid.map((value) => (
                    <li key={value}>{value}</li>
                  ))}
                </ul>
              ) : null}
              {parsedRecipients.valid.length ? (
                <ul className='flex flex-wrap gap-2'>
                  {parsedRecipients.valid.map((recipient) => (
                    <li
                      className='inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2 py-1 text-xs'
                      key={recipient.address}
                    >
                      {recipient.address}
                      <button
                        aria-label={`${t('dev.bulkSend.removeRecipient', {
                          defaultValue: 'Remove recipient',
                        })} ${recipient.address}`}
                        className='text-muted-foreground hover:text-foreground'
                        onClick={() => removeRecipient(recipient.address)}
                        type='button'
                      >
                        <X aria-hidden='true' className='size-3' />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <label className='mt-5 block text-sm font-medium'>
              {t('dev.bulkSend.subject', { defaultValue: 'Subject' })}
              <Input
                className='mt-1'
                onChange={(event) => setSubject(event.target.value)}
                value={subject}
              />
            </label>

            <div className='mt-5'>
              <MailRichTextEditor
                ariaLabel={t('dev.bulkSend.body', {
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
                      setSignatureId(nextSignatureId);
                      const next = replaceMailSignatureContent(
                        { text: bodyText, html: bodyHtml },
                        signatures,
                        nextSignatureId,
                      );
                      setBodyText(next.text);
                      setBodyHtml(next.html);
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
                    onSelect: selectTemplate,
                  },
                }}
                labels={editorLabels(t)}
                onChange={(value) => {
                  bodyHtmlRef.current = value.html;
                  bodyTextRef.current = value.text;
                  setBodyHtml(value.html);
                  setBodyText(value.text);
                }}
                placeholder={t('dev.bulkSend.bodyPlaceholder', {
                  defaultValue: 'Write a message for every recipient.',
                })}
                value={bodyHtml}
              />
            </div>

            <div className='mt-5 flex flex-wrap items-center gap-2'>
              <input
                className='sr-only'
                multiple
                onChange={(event) => uploadAttachments(event.target.files)}
                ref={attachmentInputRef}
                type='file'
              />
              <Button
                disabled={Boolean(busy)}
                onClick={() => attachmentInputRef.current?.click()}
                type='button'
                variant='outline'
              >
                <Paperclip aria-hidden='true' className='size-4' />
                {busy === 'uploading'
                  ? t('workspace.uploadingAttachment', {
                      defaultValue: 'Uploading…',
                    })
                  : t('workspace.addAttachment', {
                      defaultValue: 'Add attachment',
                    })}
              </Button>
              {attachments.map((attachment) => (
                <span
                  className='inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs'
                  key={attachment.id}
                >
                  {attachment.fileName}
                  <button
                    aria-label={`${t('workspace.removeAttachment', {
                      defaultValue: 'Remove attachment',
                    })} ${attachment.fileName}`}
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((item) => item.id !== attachment.id),
                      )
                    }
                    type='button'
                  >
                    <X aria-hidden='true' className='size-3' />
                  </button>
                </span>
              ))}
            </div>

            <label className='mt-5 block text-sm font-medium'>
              {t('dev.bulkSend.scheduledAt', {
                defaultValue: 'Send later (optional)',
              })}
              <Input
                className='mt-1 max-w-xs'
                min={localDateTimeMinimum()}
                onChange={(event) => setScheduledAt(event.target.value)}
                type='datetime-local'
                value={scheduledAt}
              />
            </label>

            <div className='mt-6 flex flex-wrap items-center gap-2 border-t pt-5'>
              <Button
                disabled={Boolean(busy) || parsedRecipients.valid.length === 0}
                onClick={reviewBulk}
                type='button'
              >
                <Send aria-hidden='true' className='size-4' />
                {t('dev.bulkSend.review', {
                  defaultValue: 'Review recipients',
                })}
              </Button>
              {selectedSignature ? (
                <span className='text-xs text-muted-foreground'>
                  {t('dev.bulkSend.signatureSelected', {
                    defaultValue: 'Signature: {{name}}',
                    name: selectedSignature.name,
                  })}
                </span>
              ) : null}
            </div>
          </Card>
        )}

        {results.length > 0 ? (
          <ResultsCard
            failedRecipients={failedRecipients}
            onRetry={() => {
              submitBulk(failedRecipients, true);
            }}
            results={results}
            retrying={busy === 'sending'}
            t={t}
          />
        ) : null}
      </div>
    </MailDevPageShell>
  );
}

function ReviewCard({
  account,
  attachments,
  body,
  identity,
  onBack,
  onConfirm,
  recipients,
  scheduledAt,
  sending,
  subject,
  t,
}: {
  readonly account: MailAccountView | undefined;
  readonly attachments: readonly MailOutboundAttachmentView[];
  readonly body: string;
  readonly identity: MailIdentity | undefined;
  readonly onBack: () => void;
  readonly onConfirm: () => void;
  readonly recipients: readonly MailAddress[];
  readonly scheduledAt: string;
  readonly sending: boolean;
  readonly subject: string;
  readonly t: (key: string, options?: Record<string, unknown>) => string;
}): ReactElement {
  return (
    <Card className='rounded-2xl bg-background p-6 shadow-sm'>
      <h2 className='text-lg font-semibold'>
        {t('dev.bulkSend.reviewTitle', { defaultValue: 'Review bulk send' })}
      </h2>
      <dl className='mt-4 grid gap-3 text-sm md:grid-cols-2'>
        <Summary label={t('dev.account', { defaultValue: 'Account' })}>
          {account?.address ?? '—'}
        </Summary>
        <Summary
          label={t('dev.bulkSend.sender', { defaultValue: 'From address' })}
        >
          {identity ? formatIdentity(identity) : '—'}
        </Summary>
        <Summary
          label={t('dev.bulkSend.recipientCount', {
            defaultValue: 'Recipients',
          })}
        >
          {recipients.length}
        </Summary>
        <Summary
          label={t('dev.bulkSend.recipient', { defaultValue: 'Recipient' })}
        >
          <div className='space-y-1'>
            {recipients.map((recipient) => (
              <div key={recipient.address}>{recipient.address}</div>
            ))}
          </div>
        </Summary>
        <Summary label={t('dev.bulkSend.subject', { defaultValue: 'Subject' })}>
          {subject}
        </Summary>
        <Summary
          label={t('dev.bulkSend.attachments', { defaultValue: 'Attachments' })}
        >
          {attachments.length
            ? attachments.map((item) => item.fileName).join(', ')
            : '—'}
        </Summary>
        <Summary
          label={t('dev.bulkSend.scheduledAt', { defaultValue: 'Send later' })}
        >
          {scheduledAt ||
            t('dev.bulkSend.sendNow', { defaultValue: 'Send now' })}
        </Summary>
      </dl>
      <div className='mt-4 rounded-xl border bg-muted/20 p-4'>
        <p className='text-xs font-medium text-muted-foreground'>
          {t('dev.bulkSend.body', { defaultValue: 'Message body' })}
        </p>
        <p className='mt-2 whitespace-pre-wrap text-sm'>{body}</p>
      </div>
      <div className='mt-5 flex flex-wrap gap-2'>
        <Button onClick={onBack} type='button' variant='outline'>
          <ArrowLeft aria-hidden='true' className='size-4' />
          {t('dev.bulkSend.back', { defaultValue: 'Back to edit' })}
        </Button>
        <Button disabled={sending} onClick={onConfirm} type='button'>
          <Send aria-hidden='true' className='size-4' />
          {sending
            ? t('dev.bulkSend.sending', { defaultValue: 'Submitting…' })
            : t('dev.bulkSend.confirm', { defaultValue: 'Confirm and send' })}
        </Button>
      </div>
    </Card>
  );
}

function ResultsCard({
  failedRecipients,
  onRetry,
  results,
  retrying,
  t,
}: {
  readonly failedRecipients: readonly MailAddress[];
  readonly onRetry: () => void;
  readonly results: readonly BulkResultRow[];
  readonly retrying: boolean;
  readonly t: (key: string, options?: Record<string, unknown>) => string;
}): ReactElement {
  return (
    <Card className='rounded-2xl bg-background p-6 shadow-sm'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h2 className='text-lg font-semibold'>
          {t('dev.bulkSend.resultsTitle', { defaultValue: 'Delivery results' })}
        </h2>
        {failedRecipients.length ? (
          <Button disabled={retrying} onClick={onRetry} variant='outline'>
            {t('dev.bulkSend.retryFailed', { defaultValue: 'Retry failed' })}
          </Button>
        ) : null}
      </div>
      <div className='mt-4 overflow-x-auto'>
        <table className='w-full min-w-[34rem] text-sm'>
          <thead className='border-b text-left text-xs text-muted-foreground'>
            <tr>
              <th className='px-3 py-2 font-medium'>
                {t('dev.bulkSend.recipient', { defaultValue: 'Recipient' })}
              </th>
              <th className='px-3 py-2 font-medium'>
                {t('dev.bulkSend.status', { defaultValue: 'Status' })}
              </th>
              <th className='px-3 py-2 font-medium'>
                {t('dev.bulkSend.submission', { defaultValue: 'Submission' })}
              </th>
            </tr>
          </thead>
          <tbody className='divide-y'>
            {results.map((row) => (
              <tr key={`${row.recipient.address}:${row.submission.id}`}>
                <td className='px-3 py-2'>{row.recipient.address}</td>
                <td className='px-3 py-2'>
                  <Status status={row.submission.status} />
                </td>
                <td className='break-all px-3 py-2 text-xs text-muted-foreground'>
                  {row.submission.error?.code ??
                    row.submission.providerMessageId ??
                    row.submission.id}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Summary({
  children,
  label,
}: {
  readonly children: ReactElement | string | number;
  readonly label: string;
}): ReactElement {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='mt-1 break-words'>{children}</dd>
    </div>
  );
}

function Status({
  status,
}: {
  readonly status: MailSubmissionStatus;
}): ReactElement {
  return (
    <span className='rounded-full border bg-muted/30 px-2 py-1 text-xs'>
      {status}
    </span>
  );
}

function formatIdentity(identity: MailIdentity): string {
  return identity.displayName
    ? `${identity.displayName} <${identity.address}>`
    : identity.address;
}

function parseRecipients(value: string): ParsedRecipients {
  const tokens = value
    .split(/[\n,;]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const valid: MailAddress[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;
  for (const token of tokens) {
    if (!isEmailAddress(token)) {
      invalid.push(token);
      continue;
    }
    const normalized = token.toLowerCase();
    if (seen.has(normalized)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(normalized);
    valid.push({ address: token });
  }
  return { valid, invalid, duplicateCount };
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function editorLabels(
  t: (key: string, options?: Record<string, unknown>) => string,
): {
  readonly toolbar: string;
  readonly bold: string;
  readonly italic: string;
  readonly underline: string;
  readonly bulletList: string;
  readonly numberedList: string;
  readonly undo: string;
  readonly redo: string;
  readonly clearFormatting: string;
  readonly fontSize: string;
  readonly heading: string;
  readonly link: string;
  readonly image: string;
  readonly normal: string;
  readonly heading1: string;
  readonly heading2: string;
  readonly heading3: string;
  readonly heading4: string;
  readonly heading5: string;
  readonly heading6: string;
  readonly fontSizeSmall: string;
  readonly fontSizeNormal: string;
  readonly fontSizeLarge: string;
} {
  return {
    toolbar: t('workspace.editor.toolbar', { defaultValue: 'Formatting' }),
    bold: t('workspace.editor.bold', { defaultValue: 'Bold' }),
    italic: t('workspace.editor.italic', { defaultValue: 'Italic' }),
    underline: t('workspace.editor.underline', { defaultValue: 'Underline' }),
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
    fontSize: t('workspace.editor.fontSize', { defaultValue: 'Font size' }),
    heading: t('workspace.editor.heading', { defaultValue: 'Heading level' }),
    link: t('workspace.editor.link', { defaultValue: 'Insert link' }),
    image: t('workspace.editor.image', { defaultValue: 'Insert image' }),
    normal: t('workspace.editor.normal', { defaultValue: 'Normal' }),
    heading1: t('workspace.editor.heading1', { defaultValue: 'Heading 1' }),
    heading2: t('workspace.editor.heading2', { defaultValue: 'Heading 2' }),
    heading3: t('workspace.editor.heading3', { defaultValue: 'Heading 3' }),
    heading4: t('workspace.editor.heading4', { defaultValue: 'Heading 4' }),
    heading5: t('workspace.editor.heading5', { defaultValue: 'Heading 5' }),
    heading6: t('workspace.editor.heading6', { defaultValue: 'Heading 6' }),
    fontSizeSmall: t('workspace.editor.fontSizeSmall', {
      defaultValue: 'Small',
    }),
    fontSizeNormal: t('workspace.editor.fontSizeNormal', {
      defaultValue: 'Normal',
    }),
    fontSizeLarge: t('workspace.editor.fontSizeLarge', {
      defaultValue: 'Large',
    }),
  };
}

function localDateTimeMinimum(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
