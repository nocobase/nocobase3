import type { ReactElement } from 'react';

export function ErrorBox({ value }: { value: string }): ReactElement {
  return (
    <div className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>
      {value}
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Authorization request failed.';
}
