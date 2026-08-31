import type { ComponentProps, ReactElement } from 'react';

function classes(...values: (string | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

export interface BadgeProps extends ComponentProps<'span'> {
  readonly className?: string;
}

export function Badge({ className, ...props }: BadgeProps): ReactElement {
  return (
    <span
      data-slot='badge'
      className={classes(
        'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        className,
      )}
      {...props}
    />
  );
}
