import { resolveAppUrl } from '@nocobase/app-sdk';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

export interface AppBrandProps {
  readonly compact?: boolean;
}

export function AppBrand({ compact = false }: AppBrandProps): ReactElement {
  return (
    <Link
      aria-label='NocoBase home'
      className='flex min-w-0 items-center gap-2.5 text-foreground'
      to='/'
    >
      <span className='size-9 shrink-0 overflow-hidden'>
        <img
          src={resolveAppUrl('/assets/logo-mark.png')}
          alt=''
          className='size-full object-contain dark:hidden'
        />
        <img
          src={resolveAppUrl('/assets/logo-mark-dark.png')}
          alt=''
          className='hidden size-full object-contain dark:block'
        />
      </span>
      {compact ? null : (
        <span className='hidden h-7 min-w-0 sm:block'>
          <img
            src={resolveAppUrl('/assets/logo.png')}
            alt='NocoBase'
            className='h-full w-auto object-contain dark:hidden'
          />
          <img
            src={resolveAppUrl('/assets/logo-dark.png')}
            alt='NocoBase'
            className='hidden h-full w-auto object-contain dark:block'
          />
        </span>
      )}
    </Link>
  );
}
