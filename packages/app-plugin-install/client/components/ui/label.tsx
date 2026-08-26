// shadcn base-nova source adapted for declaration-emitting ESM builds.
import * as React from 'react';
import type { ReactElement } from 'react';

import { cn } from '../../lib/utils.js';

export type LabelProps = React.ComponentProps<'label'>;

export function Label({ className, ...props }: LabelProps): ReactElement {
  return (
    <label
      data-slot='label'
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none',
        className,
      )}
      {...props}
    />
  );
}
