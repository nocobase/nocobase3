import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { MailAccountCard, MailPageHeader } from '../components/index.js';
import {
  mailErrorMessage,
  type MailManagedAccountView,
} from '../mail-client.js';
import { getMailClient } from '../runtime.js';
import { Button } from '../components/ui/button.js';

const mail = getMailClient();

export default function MailSettingsPage(): ReactElement {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<readonly MailManagedAccountView[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback((): void => {
    setLoading(true);
    setError(undefined);
    void mail
      .listManagedAccounts()
      .then(setAccounts)
      .catch((cause: unknown) => {
        setError(
          mailErrorMessage(
            cause,
            t('errors.requestFailed', {
              defaultValue: 'Mail request failed.',
            }),
          ),
        );
      })
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  return (
    <section className='min-h-[calc(100svh-4rem)] bg-muted/20'>
      <MailPageHeader
        actions={
          <Button disabled={loading} onClick={refresh} variant='outline'>
            <RefreshCw
              aria-hidden='true'
              className={`size-4 ${loading ? 'animate-spin' : ''}`}
            />
            {t('actions.refresh', { defaultValue: 'Refresh' })}
          </Button>
        }
        description={t('settings.description', {
          defaultValue: 'View mailboxes connected by all users.',
        })}
        eyebrow={t('settings.eyebrow', { defaultValue: 'Communication' })}
        title={t('settings.title', { defaultValue: 'Mail settings' })}
      />

      <div className='mx-auto w-full max-w-7xl space-y-6 px-6 py-6'>
        {error ? (
          <div className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>
            {error}
          </div>
        ) : null}

        <section>
          <div className='mb-3'>
            <h2 className='font-semibold'>
              {t('settings.accounts.title', {
                defaultValue: 'All connected accounts',
              })}
            </h2>
            <p className='text-sm text-muted-foreground'>
              {t('settings.accounts.description', {
                defaultValue: 'View mailboxes connected by all users.',
              })}
            </p>
          </div>

          {loading ? (
            <LoadingState
              label={t('settings.loading', {
                defaultValue: 'Loading mail configuration…',
              })}
            />
          ) : accounts.length === 0 ? (
            <EmptyState
              description={t('settings.accounts.emptyDescription', {
                defaultValue: 'No user has connected a mail account.',
              })}
              title={t('settings.accounts.emptyTitle', {
                defaultValue: 'No accounts connected',
              })}
            />
          ) : (
            <div className='space-y-3'>
              {accounts.map((account) => (
                <MailAccountCard
                  account={account}
                  canSync={false}
                  defaultLabel={t('settings.accounts.default', {
                    defaultValue: 'Default',
                  })}
                  key={account.id}
                  ownerLabel={t('settings.accounts.owner', {
                    defaultValue: 'User ID: {{userId}}',
                    userId: account.userId,
                  })}
                  providerLabel={`${account.provider.type} / ${account.provider.name}`}
                  statusLabel={t(`status.account.${account.status}`, {
                    defaultValue: account.status,
                  })}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function EmptyState({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}): ReactElement {
  return (
    <div className='rounded-xl border border-dashed bg-background p-8 text-center'>
      <p className='font-medium'>{title}</p>
      <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
    </div>
  );
}

function LoadingState({ label }: { readonly label: string }): ReactElement {
  return (
    <div className='rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground'>
      {label}
    </div>
  );
}
