import { cn } from '../../lib/utils.js';
import { Loader2Icon } from 'lucide-react';
import type { ReactElement } from 'react';

function Spinner({
  className,
  ...props
}: React.ComponentProps<'svg'>): ReactElement {
  return (
    <Loader2Icon
      data-slot='spinner'
      role='status'
      aria-label={'Loading'}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
