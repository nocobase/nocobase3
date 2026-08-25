import { Input as InputPrimitive } from '@base-ui/react/input';
import type { ComponentProps, ReactElement } from 'react';

import { cn } from './utils.js';

export type InputProps = ComponentProps<'input'>;

export function Input({ className, type, ...props }: InputProps): ReactElement {
  return (
    <InputPrimitive
      type={type}
      data-slot='input'
      className={cn(
        'h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
