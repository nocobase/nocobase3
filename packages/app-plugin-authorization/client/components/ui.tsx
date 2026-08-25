import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactElement,
} from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'default' | 'outline' | 'ghost';
  readonly size?: 'default' | 'sm';
}

export function Button({
  className = '',
  variant = 'default',
  size = 'default',
  type = 'button',
  ...props
}: ButtonProps): ReactElement {
  const variantClass = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/80',
    outline: 'border-border bg-background hover:bg-muted',
    ghost: 'hover:bg-muted',
  }[variant];
  const sizeClass = size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm';

  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg border border-transparent font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${variantClass} ${sizeClass} ${className}`}
      type={type}
      {...props}
    />
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = '', ...props }: InputProps): ReactElement {
  return (
    <input
      className={`h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className = '', ...props }: LabelProps): ReactElement {
  return (
    <label
      className={`flex items-center gap-2 text-sm font-medium ${className}`}
      {...props}
    />
  );
}
