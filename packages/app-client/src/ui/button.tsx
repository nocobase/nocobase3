import { Button as ButtonPrimitive } from '@base-ui/react/button';
import type { ReactElement } from 'react';

import { cn } from './utils.js';

type ButtonVariantOptions = {
  className?: string;
  size?: 'default' | 'sm' | 'icon';
  variant?: 'default' | 'outline' | 'ghost';
};

const variantClasses: Record<
  NonNullable<ButtonVariantOptions['variant']>,
  string
> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/80',
  outline: 'border-border bg-background hover:bg-muted hover:text-foreground',
  ghost: 'hover:bg-muted hover:text-foreground',
};

const sizeClasses: Record<NonNullable<ButtonVariantOptions['size']>, string> = {
  default: 'h-9 gap-2 px-4',
  sm: 'h-8 gap-1.5 px-3 text-xs',
  icon: 'size-9',
};

function buttonVariants({
  className,
  size = 'default',
  variant = 'default',
}: ButtonVariantOptions = {}): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

export type ButtonProps = ButtonPrimitive.Props & ButtonVariantOptions;

export function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps): ReactElement {
  return (
    <ButtonPrimitive
      data-slot='button'
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
