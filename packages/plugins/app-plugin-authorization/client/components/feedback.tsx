import type { ReactElement, ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from './ui/alert.js';

export function ErrorBox({ value }: { value: string }): ReactElement {
  return (
    <Alert className='border-destructive/30 bg-destructive/5'>
      <AlertDescription className='text-destructive'>{value}</AlertDescription>
    </Alert>
  );
}

/** An explanation of how a layer behaves, not a failure. */
export function NoticeBox({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Alert className='bg-muted/40'>
      {title === undefined ? null : <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Authorization request failed.';
}
