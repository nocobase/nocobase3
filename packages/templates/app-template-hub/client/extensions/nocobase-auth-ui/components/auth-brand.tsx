import { resolveAppUrl } from '@nocobase/app-client';
import type { ReactElement } from 'react';

export function AuthBrand(): ReactElement {
  return (
    <div
      aria-label='NocoBase'
      className='flex h-10 w-full items-center justify-center'
      role='img'
    >
      <img
        alt=''
        aria-hidden='true'
        className='h-10 w-auto object-contain dark:hidden'
        src={resolveAppUrl('/assets/logo.png')}
      />
      <img
        alt=''
        aria-hidden='true'
        className='hidden h-10 w-auto object-contain dark:block'
        src={resolveAppUrl('/assets/logo-dark.png')}
      />
    </div>
  );
}
