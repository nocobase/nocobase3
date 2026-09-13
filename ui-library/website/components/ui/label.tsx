import type { LabelHTMLAttributes, ReactElement } from 'react';

import { cn } from '../../lib/utils';

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>): ReactElement {
  return (
    <label
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none',
        className,
      )}
      {...props}
    />
  );
}
