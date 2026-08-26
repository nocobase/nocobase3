import { useGetIdentity, useLogout } from '@refinedev/core';
import { LogOut, UserRound } from 'lucide-react';
import type { ReactElement } from 'react';

interface AppIdentity {
  readonly avatar?: string;
  readonly email?: string;
  readonly fullName?: string;
  readonly id: string | number;
}

export function UserMenu(): ReactElement {
  const { data: identity, isLoading } = useGetIdentity<AppIdentity>();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();

  const name = identity?.fullName || identity?.email || 'Account';
  const initials = getInitials(name);

  return (
    <details className='relative'>
      <summary
        aria-label='Open account menu'
        className='flex size-10 cursor-pointer list-none items-center justify-center rounded-full border border-border/70 bg-background/60 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden'
        title={name}
      >
        {identity?.avatar ? (
          <img
            src={identity.avatar}
            alt=''
            className='size-full rounded-full object-cover'
          />
        ) : (
          <span className='grid size-full place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground'>
            {isLoading ? <UserRound className='size-4' /> : initials}
          </span>
        )}
      </summary>
      <div className='absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg'>
        <div className='border-b border-border px-2 py-2'>
          <p className='truncate text-sm font-medium'>{name}</p>
          {identity?.email ? (
            <p className='truncate text-xs text-muted-foreground'>
              {identity.email}
            </p>
          ) : null}
        </div>
        <button
          type='button'
          className='mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50'
          disabled={isLoggingOut}
          onClick={() => logout()}
        >
          <LogOut className='size-4' />
          {isLoggingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </details>
  );
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}
