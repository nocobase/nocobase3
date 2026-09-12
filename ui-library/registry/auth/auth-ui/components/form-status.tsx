import type { ReactElement, ReactNode } from 'react';

export interface FormStatusProps {
  readonly children: ReactNode;
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
