import { cva } from 'class-variance-authority';
import type { ComponentProps, ReactElement } from 'react';

import { cn } from '../../lib/utils.js';

export type BadgeVariant = 'default' | 'outline';

interface BadgeVariantOptions {
  readonly variant?: BadgeVariant | null;
}

const badgeVariants: (options?: BadgeVariantOptions) => string = cva(
  'inline-flex h-6 w-fit shrink-0 items-center justify-center rounded-md border px-2.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        outline: 'border-border bg-background text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type BadgeProps = ComponentProps<'span'> & {
  readonly variant?: BadgeVariant;
};

export function Badge({
  className,
  variant = 'default',
  ...props
}: BadgeProps): ReactElement {
  return (
    <span
      data-slot='badge'
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}
