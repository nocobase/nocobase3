import { CheckIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactElement } from 'react';

import { cn } from '../../lib/utils.js';

export interface CheckboxProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange'
> {
  readonly checked?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
}

function Checkbox({
  className,
  checked = false,
  onCheckedChange,
  disabled,
  onClick,
  ...props
}: CheckboxProps): ReactElement {
  return (
    <button
      type='button'
      role='checkbox'
      aria-checked={checked}
      disabled={disabled}
      data-slot='checkbox'
      data-checked={checked ? '' : undefined}
      className={cn(
        'peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary',
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange?.(!checked);
      }}
      {...props}
    >
      {checked ? (
        <span
          data-slot='checkbox-indicator'
          className='grid place-content-center text-current transition-none [&>svg]:size-3.5'
        >
          <CheckIcon />
        </span>
      ) : null}
    </button>
  );
}

export { Checkbox };
