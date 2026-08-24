import type { ReactElement } from 'react';

export interface FormMessageProps {
  readonly children: string;
  readonly type: 'error' | 'success';
}

export function FormMessage({
  children,
  type,
}: FormMessageProps): ReactElement {
  return (
    <p
      className={
        type === 'error'
          ? 'text-sm text-destructive'
          : 'text-sm text-foreground'
      }
      role={type === 'error' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}
