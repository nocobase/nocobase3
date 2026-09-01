import { useTranslation } from '@nocobase/i18n/client';
import { useGetIdentity, useLogout } from '@refinedev/core';
import { LogOut, UserRound } from 'lucide-react';
import type { ReactElement } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { LanguageSwitcher } from './language-switcher.js';

interface AppIdentity {
  readonly avatar?: string;
  readonly email?: string;
  readonly fullName?: string;
  readonly id: string | number;
}

export function UserMenu(): ReactElement {
  const { data: identity, isLoading } = useGetIdentity<AppIdentity>();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const { t } = useTranslation();

  const name =
    identity?.fullName ||
    identity?.email ||
    t('account.fallback', { defaultValue: 'Account' });
  const initials = getInitials(name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('account.openMenu', {
          defaultValue: 'Open account menu',
        })}
        className='flex size-10 cursor-pointer items-center justify-center rounded-full border border-border/70 bg-background/60 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50'
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-64'>
        <div className='px-2 py-1.5'>
          <p className='truncate text-sm font-medium'>{name}</p>
          {identity?.email ? (
            <p className='truncate text-xs text-muted-foreground'>
              {identity.email}
            </p>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        {/* Outside the item list: this is a control to operate, not a command that closes the menu when chosen. */}
        <div className='px-1 py-1'>
          <LanguageSwitcher />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isLoggingOut}
          onClick={() => logout()}
          className='gap-2'
        >
          <LogOut className='size-4' />
          {isLoggingOut
            ? t('account.signingOut', { defaultValue: 'Signing out…' })
            : t('account.signOut', { defaultValue: 'Sign out' })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
