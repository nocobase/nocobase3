// shadcn source adapted for declaration-emitting ESM builds.
import type { ComponentProps, ReactElement } from 'react';

import { cn } from '../../lib/utils.js';

export function Label({
  className,
  ...props
}: ComponentProps<'label'>): ReactElement {
  return <label className={cn('text-sm font-medium', className)} {...props} />;
}
