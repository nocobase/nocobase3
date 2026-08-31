// shadcn base-nova source adapted for declaration-emitting ESM builds.
import { Input as InputPrimitive } from '@base-ui/react/input';
import * as React from 'react';
import type { ReactElement } from 'react';

import { cn } from '../../lib/utils.js';

export type InputProps = React.ComponentProps<'input'>;

export function Input({ className, type, ...props }: InputProps): ReactElement {
  return (
    <InputPrimitive
      type={type}
      data-slot='input'
      className={cn(
        'h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:text-sm dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}
