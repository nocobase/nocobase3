import { Switch } from '../components/ui/switch.js';
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
    <Switch
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange}
    />
  );
}
