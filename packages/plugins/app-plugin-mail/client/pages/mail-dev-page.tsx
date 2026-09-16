import { RefreshCw, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import {
  MailDevPageShell,
  MailNavigationIcon,
  MailStatusBadge,
  MailRichTextEditor,
} from '../components/index.js';
import {
  mailErrorMessage,
  type MailAccountView,
  type MailIdentity,
  type MailSubmissionView,
  type MailSignature,
  type MailTemplate,
} from '../mail-client.js';
import { useMailClient } from '../runtime.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { NativeSelect } from '../components/ui/native-select.js';
import MailWorkspacePage from './mail-workspace-page.js';
import { renderMailTemplate } from '../lib/mail-template.js';
import { replaceMailSignatureContent } from '../lib/mail-signature.js';

interface ComposeValue {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export function MailCenterDevPage(): ReactElement {
  const { t } = useTranslation();

  return (
    <MailDevPageShell
      badge={t('nav.dev', { defaultValue: 'Mail components' })}
      category={t('dev.centerCategory', { defaultValue: 'Mailbox preview' })}
      description={t('dev.centerDescription', {
        defaultValue:
          'Filter, refresh, and inspect locally stored mail components.',
      })}
      title={t('dev.centerTitle', { defaultValue: 'Mail center' })}
      actions={
        <span
          aria-label={t('nav.mail', { defaultValue: 'Mail' })}
          className='inline-flex size-9 items-center justify-center rounded-lg border bg-background text-muted-foreground'
          role='img'
        >
          <MailNavigationIcon />
        </span>
      }
    >
      <Card className='flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-background shadow-sm lg:max-h-[calc(100svh-18rem)]'>
        <MailWorkspacePage />
      </Card>
    </MailDevPageShell>
  );
}

export function MailSendDevPage(): ReactElement {
  return <MailDevPage />;
}

function MailDevPage(): ReactElement {
  const mail = useMailClient();
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<readonly MailAccountView[]>([]);
  const [accountId, setAccountId] = useState('');
  const [identities, setIdentities] = useState<readonly MailIdentity[]>([]);
  const [identityId, setIdentityId] = useState('');
  const [compose, setCompose] = useState<ComposeValue>({
    to: '',
    subject: '',
    text: '',
    html: '',
  });
  const [signatures, setSignatures] = useState<readonly MailSignature[]>([]);
  const [signatureId, setSignatureId] = useState('');
  const [templates, setTemplates] = useState<readonly MailTemplate[]>([]);
  const [submission, setSubmission] = useState<MailSubmissionView>();
  const [busy, setBusy] = useState<'loading' | 'sending'>();
  const [error, setError] = useState<string>();

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId),
    [accountId, accounts],
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
        if (nextAccounts.length === 0) {
          setIdentityId('');
        }
      })
      .catch((cause: unknown) =>
        setError(
          mailErrorMessage(
            cause,
            t('errors.requestFailed', { defaultValue: 'Mail request failed.' }),
          ),
        ),
      )
      .finally(() => setBusy(undefined));
  }, [mail, t]);

  useEffect(() => {
    void Promise.resolve().then(loadAccounts);
  }, [loadAccounts]);

  useEffect(() => {
    void mail.listTemplates().then(setTemplates);
  }, [mail]);

  useEffect(() => {
    if (!accountId) {
      void Promise.resolve().then(() => {
        setIdentities([]);
        setSignatures([]);
        setSignatureId('');
      });
      return;
    }
    void mail.listSignatures(accountId).then(
      (items) => {
        setSignatures(items);
        const nextSignatureId = items.find((item) => item.isDefault)?.id ?? '';
        setSignatureId(nextSignatureId);
        setCompose((current) =>
          current.text.trim() || current.html.trim()
            ? current
            : {
                ...current,
                ...replaceMailSignatureContent(
                  { text: current.text, html: current.html },
                  items,
                  nextSignatureId,
                ),
              },
        );
      },
      (cause: unknown) =>
        setError(
          mailErrorMessage(
            cause,
            t('errors.requestFailed', {
              defaultValue: 'Mail request failed.',
            }),
          ),
        ),
    );
  }, [accountId, mail, t]);

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    void mail.listIdentities(accountId).then(
      (nextIdentities) => {
        if (!active) return;
        setIdentities(nextIdentities);
        setIdentityId(
          nextIdentities.find(
            (identity) => identity.isPrimary && identity.canSend,
          )?.id ??
            nextIdentities.find((identity) => identity.canSend)?.id ??
            '',
        );
      },
      (cause: unknown) => {
        if (active)
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
    return () => {
      active = false;
    };
  }, [accountId, mail, t]);

  const sendMessage = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!accountId || !identityId || !compose.to.trim()) return;
    setBusy('sending');
    setError(undefined);
    setSubmission(undefined);
    void mail
      .sendMessage({
        accountId,
        identityId,
        to: compose.to
          .split(',')
          .map((address) => address.trim())
          .filter(Boolean)
          .map((address) => ({ address })),
        subject: compose.subject,
        text: compose.text,
        html: compose.html || undefined,
        signatureId: signatureId || undefined,
        idempotencyKey: createIdempotencyKey(),
      })
      .then(setSubmission)
      .catch((cause: unknown) =>
        setError(
          mailErrorMessage(
            cause,
            t('errors.sendFailed', {
              defaultValue: 'Could not submit the message.',
            }),
          ),
        ),
      )
      .finally(() => setBusy(undefined));
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
      category={t('dev.sendCategory', { defaultValue: 'Operations' })}
      description={t('dev.sendPageDescription', {
        defaultValue:
          'Exercise the mail sending API against a connected account and identity.',
      })}
      title={t('dev.sendPageTitle', { defaultValue: 'Send mail' })}
    >
      <div className='mx-auto max-w-4xl space-y-5 pb-12'>
        {error ? (
          <div className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>
            {error}
          </div>
        ) : null}

        <div className='grid gap-6'>
          <Card className='rounded-2xl bg-background p-6 shadow-sm'>
            <div className='flex items-center gap-2'>
              <Send aria-hidden='true' className='size-5 text-primary' />
              <h2 className='font-semibold'>
                {t('dev.send.title', { defaultValue: 'Send a message' })}
              </h2>
            </div>
            <p className='mt-1 text-sm text-muted-foreground'>
              {t('dev.send.description', {
                defaultValue:
                  'Each submission receives a fresh idempotency key and runs through the Mail send operation.',
              })}
            </p>
            <form className='mt-5 space-y-4' onSubmit={sendMessage}>
              <div className='grid gap-4'>
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
              </div>
              {selectedAccount ? (
                <p className='text-xs text-muted-foreground'>
                  {selectedAccount.provider.type} /{' '}
                  {selectedAccount.provider.name}
                </p>
              ) : null}
              <label className='block text-sm font-medium'>
                {t('dev.send.from', { defaultValue: 'From address' })}
                <NativeSelect
                  className='mt-1'
                  disabled={
                    identities.filter((identity) => identity.canSend).length ===
                    0
                  }
                  onChange={(event) => setIdentityId(event.target.value)}
                  value={identityId}
                >
                  {identities.filter((identity) => identity.canSend).length ===
                  0 ? (
                    <option value=''>
                      {t('dev.send.noSenders', {
                        defaultValue: 'No sendable addresses',
                      })}
                    </option>
                  ) : null}
                  {identities
                    .filter((identity) => identity.canSend)
                    .map((identity) => (
                      <option key={identity.id} value={identity.id}>
                        {formatIdentity(identity)}
                      </option>
                    ))}
                </NativeSelect>
              </label>
              <label className='block text-sm font-medium'>
                {t('dev.send.to', { defaultValue: 'To' })}
                <Input
                  className='mt-1'
                  onChange={(event) =>
                    setCompose((current) => ({
                      ...current,
                      to: event.target.value,
                    }))
                  }
                  placeholder={t('dev.send.toPlaceholder', {
                    defaultValue: 'alice@example.com, bob@example.com',
                  })}
                  required
                  value={compose.to}
                />
              </label>
              <label className='block text-sm font-medium'>
                {t('dev.send.subject', { defaultValue: 'Subject' })}
                <Input
                  className='mt-1'
                  onChange={(event) =>
                    setCompose((current) => ({
                      ...current,
                      subject: event.target.value,
                    }))
                  }
                  placeholder={t('dev.send.subjectPlaceholder', {
                    defaultValue: 'NocoBase mail test',
                  })}
                  required
                  value={compose.subject}
                />
              </label>
              <MailRichTextEditor
                ariaLabel={t('dev.send.body', {
                  defaultValue: 'Message body',
                })}
                insertActions={{
                  signature: {
                    label: t('workspace.signature', {
                      defaultValue: 'Signature',
                    }),
                    options: [
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
                      setCompose((current) => ({
                        ...current,
                        ...replaceMailSignatureContent(
                          { text: current.text, html: current.html },
                          signatures,
                          nextSignatureId,
                        ),
                      }));
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
                      if (
                        (compose.subject.trim() ||
                          compose.text.trim() ||
                          compose.html.trim()) &&
                        !window.confirm(
                          t('dev.send.templateConfirm', {
                            defaultValue:
                              'This replaces the existing subject and message body. Continue?',
                          }),
                        )
                      ) {
                        return;
                      }
                      const rendered = renderMailTemplate(template);
                      setCompose((current) => ({
                        ...current,
                        subject: rendered.subject,
                        text: rendered.text,
                        html: rendered.html,
                      }));
                    },
                  },
                }}
                labels={{
                  toolbar: 'Formatting',
                  bold: 'Bold',
                  italic: 'Italic',
                  underline: 'Underline',
                  bulletList: 'Bulleted list',
                  numberedList: 'Numbered list',
                  undo: 'Undo',
                  redo: 'Redo',
                  clearFormatting: 'Clear formatting',
                  fontSize: 'Font size',
                  heading: 'Heading level',
                  link: 'Insert link',
                  image: 'Insert image',
                  normal: 'Normal',
                  heading1: 'Heading 1',
                  heading2: 'Heading 2',
                  heading3: 'Heading 3',
                  heading4: 'Heading 4',
                  heading5: 'Heading 5',
                  heading6: 'Heading 6',
                  fontSizeSmall: 'Small',
                  fontSizeNormal: 'Normal',
                  fontSizeLarge: 'Large',
                }}
                onChange={(value) =>
                  setCompose((current) => ({ ...current, ...value }))
                }
                placeholder={t('dev.send.bodyPlaceholder', {
                  defaultValue: 'Write your message.',
                })}
                value={compose.html || compose.text}
              />
              <Button
                disabled={!accountId || !identityId || busy === 'sending'}
                type='submit'
              >
                <Send aria-hidden='true' className='size-4' />
                {busy === 'sending'
                  ? t('dev.send.sending', { defaultValue: 'Submitting…' })
                  : t('dev.send.submit', { defaultValue: 'Submit message' })}
              </Button>
            </form>
            {submission ? (
              <ResultRow
                detail={submission.providerMessageId ?? submission.id}
                label={t('dev.send.accepted', {
                  defaultValue: 'Submission',
                })}
                status={submission.status}
              />
            ) : null}
          </Card>
        </div>
      </div>
    </MailDevPageShell>
  );
}

export default MailCenterDevPage;

function ResultRow({
  label,
  status,
  detail,
}: {
  readonly label: string;
  readonly status: string;
  readonly detail: string;
}): ReactElement {
  return (
    <div className='mt-5 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-3 text-sm'>
      <span className='font-medium'>{label}</span>
      <MailStatusBadge label={status} tone={statusTone(status)} />
      <span className='break-all text-muted-foreground'>{detail}</span>
    </div>
  );
}

function statusTone(status: string): 'success' | 'danger' | 'info' {
  if (status === 'accepted' || status === 'completed') return 'success';
  if (status === 'failed' || status === 'cancelled') return 'danger';
  return 'info';
}

function createIdempotencyKey(): string {
  return `mail-dev-${globalThis.crypto.randomUUID()}`;
}

function formatIdentity(identity: MailIdentity): string {
  return identity.displayName
    ? `${identity.displayName} <${identity.address}>`
    : identity.address;
}
