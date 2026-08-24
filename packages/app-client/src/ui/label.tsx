import type { ComponentProps, ReactElement } from 'react';

import { cn } from './utils.js';

export type LabelProps = ComponentProps<'label'>;

export function Label({ className, ...props }: LabelProps): ReactElement {
  return (
    <label
      data-slot='label'
      className={cn('text-sm font-medium leading-none', className)}
      {...props}
    />
  );
}
