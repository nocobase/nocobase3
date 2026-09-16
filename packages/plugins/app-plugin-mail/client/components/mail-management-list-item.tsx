import type { ReactElement, ReactNode } from 'react';

import { cn } from '../lib/utils.js';

interface MailManagementListItemProps {
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
  readonly ariaLabel?: string;
}

export function MailManagementListItem({
  selected,
  onSelect,
  children,
  actions,
  ariaLabel,
}: MailManagementListItemProps): ReactElement {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center border-l-2 border-transparent transition-colors hover:bg-muted/30',
        selected &&
          'border-b-transparent border-l-primary bg-primary/10 hover:bg-primary/15',
      )}
    >
      <button
        aria-current={selected ? 'true' : undefined}
        aria-label={ariaLabel}
        className='flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
        onClick={onSelect}
        type='button'
      >
        {children}
      </button>
      {actions ? (
        <div className='flex shrink-0 items-center gap-1 pr-2'>{actions}</div>
      ) : null}
    </div>
  );
}
