import type { ReactElement } from 'react';

export interface FormStatusProps {
  readonly children: string;
  readonly type: 'error' | 'success';
}

export function FormStatus({ children, type }: FormStatusProps): ReactElement {
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
