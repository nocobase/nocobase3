import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { MailComposer } from '../components/mail-composer.js';
import { Button } from '../components/ui/button.js';
import { NativeSelect } from '../components/ui/native-select.js';
import {
  EMPTY_COMPOSER,
  findProviderCapabilities,
} from '../lib/mail-composer-state.js';
import {
  mailErrorMessage,
  type MailAccountView,
  type MailProviderView,
} from '../mail-client.js';
import { useMailClient } from '../runtime.js';

export default function MailSendPage(): ReactElement {
  const mail = useMailClient();
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<readonly MailAccountView[]>([]);
  const [providers, setProviders] = useState<readonly MailProviderView[]>([]);
  const [accountId, setAccountId] = useState('');
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const request = useMemo(
    () => ({ accountId, value: EMPTY_COMPOSER, attachments: [] }),
    [accountId],
  );
  useEffect(() => {
    let active = true;
    void Promise.all([mail.listAccounts(), mail.listProviders()])
      .then(([items, definitions]) => {
        if (!active) return;
        const sendable = items.filter(
          (account) =>
            account.status === 'active' &&
            findProviderCapabilities(account, definitions)?.send,
        );
        setAccounts(sendable);
        setProviders(definitions);
        setAccountId(sendable[0]?.id ?? '');
        setEditing(sendable.length > 0);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            mailErrorMessage(
              cause,
              t('errors.requestFailed', {
                defaultValue: 'Mail request failed.',
              }),
            ),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mail, t, revision]);
  return (
    <div className='mx-auto max-w-5xl space-y-4 pb-12'>
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role='status' className='rounded-xl border bg-muted/30 p-4 text-sm'>
          {notice}
        </p>
      ) : null}
      <label className='grid gap-2 text-sm font-medium'>
        {t('dev.account', { defaultValue: 'Account' })}
        <NativeSelect
          disabled={editing || loading}
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
        >
          {accounts.length === 0 ? (
            <option value=''>
              {t('dev.noAccounts', { defaultValue: 'No connected accounts' })}
            </option>
          ) : null}
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.address}
            </option>
          ))}
        </NativeSelect>
      </label>
      {editing && accountId ? (
        <>
          <p className='text-xs text-muted-foreground'>
            {t('dev.sendHub.accountHelp', {
              defaultValue:
                'Close or save the current message before switching accounts.',
            })}
          </p>
          <MailComposer
            inline
            allowBulkSend
            request={request}
            accounts={accounts}
            providers={providers}
            templateVariables={{}}
            onClose={() => setEditing(false)}
            onComplete={(result) => {
              setNotice(
                t(
                  result === 'accepted'
                    ? 'workspace.accepted'
                    : result === 'draft'
                      ? 'workspace.draftSaved'
                      : result === 'unknown'
                        ? 'workspace.submissionUnknown'
                        : 'workspace.submissionFailed',
                ),
              );
            }}
          />
        </>
      ) : (
        <div className='flex gap-2'>
          <Button
            disabled={!accountId || loading}
            onClick={() => {
              setNotice(undefined);
              setEditing(true);
            }}
          >
            {t('workspace.compose', { defaultValue: 'Compose' })}
          </Button>
          <Button
            disabled={loading}
            variant='outline'
            onClick={() => {
              setLoading(true);
              setError(undefined);
              setRevision((value) => value + 1);
            }}
          >
            {t('actions.reloadAccounts', { defaultValue: 'Reload accounts' })}
          </Button>
        </div>
      )}
    </div>
  );
}
