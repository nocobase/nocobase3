import { PlugZap } from 'lucide-react';
import type { ReactElement } from 'react';

import type { MailProviderView } from '../mail-client.js';

export interface MailProviderCardProps {
  readonly provider: MailProviderView;
  readonly connectedAccounts: number;
  readonly connectLabel: string;
  readonly connectedLabel: string;
  readonly capabilityLabel: (capability: string) => string;
  readonly connecting?: boolean;
  readonly onConnect: (provider: MailProviderView) => void;
}

export function MailProviderCard({
  provider,
  connectedAccounts,
  connectLabel,
  connectedLabel,
  capabilityLabel,
  connecting = false,
  onConnect,
}: MailProviderCardProps): ReactElement {
  const capabilities = Object.entries(provider.capabilities)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);

  return (
    <article className='flex h-full flex-col rounded-xl border bg-card p-5 shadow-sm'>
      <div className='flex items-start justify-between gap-4'>
        <div className='flex min-w-0 items-center gap-3'>
          <span className='grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary'>
            <PlugZap aria-hidden='true' className='size-5' />
          </span>
          <div className='min-w-0'>
            <h3 className='truncate font-semibold'>{provider.label}</h3>
            <p className='truncate text-xs text-muted-foreground'>
              {provider.name}
            </p>
          </div>
        </div>
        {connectedAccounts > 0 ? (
          <span className='rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700'>
            {connectedLabel}
          </span>
        ) : null}
      </div>
      <div className='mt-4 flex flex-wrap gap-1.5'>
        {capabilities.map((capability) => (
          <span
            className='rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground'
            key={capability}
          >
            {capabilityLabel(capability)}
          </span>
        ))}
      </div>
      <button
        className='mt-5 inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium shadow-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'
        disabled={connecting}
        onClick={() => onConnect(provider)}
        type='button'
      >
        {connectLabel}
      </button>
    </article>
  );
}
