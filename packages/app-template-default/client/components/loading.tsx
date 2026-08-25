import type { ComponentPropsWithoutRef, ReactElement } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export interface LoadingProps extends ComponentPropsWithoutRef<'div'> {
  readonly fullscreen?: boolean;
  readonly label?: string;
}

export function Loading({
  className,
  fullscreen = false,
  label = 'Loading',
  ...props
}: LoadingProps): ReactElement {
  return (
    <div
      aria-label={label}
      className={cn(
        'flex items-center justify-center',
        fullscreen && 'min-h-svh w-full bg-background',
        className,
      )}
      role='status'
      {...props}
    >
      <Spinner aria-hidden='true' role={undefined} />
    </div>
  );
}
