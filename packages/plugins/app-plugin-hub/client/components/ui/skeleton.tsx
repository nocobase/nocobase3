import { cn } from '../../lib/utils.js';
import type { ReactElement } from 'react';

function Skeleton({
  className,
  ...props
}: React.ComponentProps<'div'>): ReactElement {
  return (
    <div
      data-slot='skeleton'
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
