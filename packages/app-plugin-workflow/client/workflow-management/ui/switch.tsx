import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import type { ReactElement } from 'react';

export interface SwitchProps extends Omit<
  SwitchPrimitive.Root.Props,
  'className'
> {
  readonly className?: string;
  readonly size?: 'default' | 'labeled';
}

export function Switch({
  className = '',
  size = 'default',
  ...props
}: SwitchProps): ReactElement {
  return (
    <SwitchPrimitive.Root
      className={`peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[size=default]:h-[18.4px] data-[size=default]:w-8 data-[size=labeled]:h-6 data-[size=labeled]:w-14 data-checked:bg-primary data-unchecked:bg-input data-disabled:cursor-not-allowed data-disabled:opacity-50 ${className}`}
      data-size={size}
      data-slot='switch'
      {...props}
    >
      <SwitchPrimitive.Thumb
        className='pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=labeled]/switch:size-5 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=labeled]/switch:data-checked:translate-x-8 group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=labeled]/switch:data-unchecked:translate-x-px dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground'
        data-slot='switch-thumb'
      />
    </SwitchPrimitive.Root>
  );
}
