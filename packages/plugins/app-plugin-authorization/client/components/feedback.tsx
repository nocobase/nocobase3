import type { ReactElement } from 'react';

import type { Translate } from '../i18n.js';
import { Alert, AlertDescription } from './ui/alert.js';

export function ErrorBox({ value }: { value: string }): ReactElement {
  return (
    <Alert className='border-destructive/30 bg-destructive/5'>
      <AlertDescription className='text-destructive'>{value}</AlertDescription>
    </Alert>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function errorMessage(t: Translate, error: unknown): string {
  return error instanceof Error ? error.message : t('errors.requestFailed');
}
