import type { LoadingProps } from '@nocobase/ui/contracts';
import type { ReactElement } from 'react';

import { cn } from './utils';

export function Loading({
  className,
  fullscreen = false,
  label = 'Loading',
  ...props
}: LoadingProps): ReactElement {
  return (
    <div
      role='status'
      aria-label={label}
      className={cn(
        'flex items-center justify-center',
        fullscreen && 'min-h-svh w-full bg-background',
        className,
      )}
      {...props}
    >
      <svg
        data-slot='loading-indicator'
        viewBox='0 0 24 24'
        fill='none'
        aria-hidden='true'
        className='size-7 animate-spin text-primary motion-reduce:animate-none motion-reduce:opacity-65'
      >
        <path
          d='M21 12a9 9 0 1 1-6.219-8.56'
          stroke='currentColor'
          strokeWidth='2'
          strokeLinecap='round'
        />
      </svg>
    </div>
  );
}

export type { LoadingProps };
