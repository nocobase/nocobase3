// shadcn base-nova source adapted for declaration-emitting ESM builds.
import { Input as InputPrimitive } from '@base-ui/react/input';
import type { ComponentProps, ReactElement } from 'react';

import { cn } from '../../lib/utils.js';

export type InputProps = ComponentProps<'input'>;

export function Input({ className, type, ...props }: InputProps): ReactElement {
  return (
    <InputPrimitive
      type={type}
      data-slot='input'
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}
