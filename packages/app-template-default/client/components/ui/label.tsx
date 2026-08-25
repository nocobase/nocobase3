import type { LabelProps } from '@nocobase/ui/contracts';
import type { ReactElement } from 'react';

import { cn } from './utils';

export function Label({ className, ...props }: LabelProps): ReactElement {
  return (
    <label
      data-slot='label'
      className={cn('text-sm font-medium leading-none', className)}
      {...props}
    />
  );
}

export type { LabelProps };
