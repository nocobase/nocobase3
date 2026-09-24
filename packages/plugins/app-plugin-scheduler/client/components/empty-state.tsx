import { CalendarClock } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

/** Placeholder for a section whose data is loading, missing, or filtered away. */
export function EmptyState({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='flex flex-col items-center gap-3 px-6 py-14 text-center text-sm text-muted-foreground'>
      <span className='grid size-11 place-items-center rounded-full bg-muted'>
        <CalendarClock className='size-5' />
      </span>
      {children}
    </div>
  );
}
