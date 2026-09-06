import type { ReactElement } from 'react';

import { formatClientDateTime, formatClientRelativeTime } from './date-time.js';

export interface DateTimeValueProps {
  readonly value: string;
}

export function DateTimeValue({ value }: DateTimeValueProps): ReactElement {
  const relative = formatClientRelativeTime(value);
  return (
    <span className='block'>
      <span className='block'>{formatClientDateTime(value)}</span>
      {relative ? (
        <span className='mt-1 block text-xs text-muted-foreground'>
          {relative}
        </span>
      ) : null}
    </span>
  );
}
