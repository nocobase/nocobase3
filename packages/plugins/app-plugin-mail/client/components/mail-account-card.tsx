import { RefreshCw } from 'lucide-react';
import type { ReactElement } from 'react';

import type { MailAccountView } from '../mail-client.js';
import { MailStatusBadge, type MailStatusTone } from './mail-status-badge.js';

export interface MailAccountCardProps {
  readonly account: MailAccountView;
  readonly providerLabel: string;
  readonly syncLabel: string;
  readonly defaultLabel: string;
  readonly statusLabel: string;
  readonly syncing?: boolean;
  readonly onSync: (account: MailAccountView) => void;
}

export function MailAccountCard({
  account,
  providerLabel,
  syncLabel,
  defaultLabel,
  statusLabel,
  syncing = false,
  onSync,
}: MailAccountCardProps): ReactElement {
  return (
    <article className='rounded-xl border bg-card p-5 shadow-sm'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <h3 className='truncate font-semibold'>{account.address}</h3>
            <MailStatusBadge
              label={statusLabel}
              tone={accountStatusTone(account.status)}
            />
            {account.isDefault ? (
              <MailStatusBadge label={defaultLabel} tone='info' />
            ) : null}
          </div>
          <p className='mt-1 text-sm text-muted-foreground'>
            {account.displayName ? `${account.displayName} · ` : ''}
            {providerLabel}
          </p>
        </div>
        <button
          className='inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50'
          disabled={syncing || account.status !== 'active'}
          onClick={() => onSync(account)}
          type='button'
        >
          <RefreshCw
            aria-hidden='true'
            className={`size-4 ${syncing ? 'animate-spin' : ''}`}
          />
          {syncLabel}
        </button>
      </div>
    </article>
  );
}

function accountStatusTone(status: MailAccountView['status']): MailStatusTone {
  if (status === 'active') return 'success';
  if (status === 'connecting') return 'info';
  if (status === 'reauthorizationRequired') return 'warning';
  return 'danger';
}
