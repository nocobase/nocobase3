import type { ReactElement } from 'react';

export function ScheduleSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className='relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-input after:absolute after:-inset-x-2 after:-inset-y-2 focus-visible:ring-3 focus-visible:ring-ring/50 data-[checked=true]:bg-primary disabled:cursor-not-allowed disabled:opacity-50'
      data-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role='switch'
      type='button'
    >
      <span
        className={`pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  );
}
