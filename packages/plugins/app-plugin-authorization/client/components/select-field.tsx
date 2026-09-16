import type { ComponentProps, ReactElement, ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select.js';

type SelectOption = { value: string; label: ReactNode };

export function SelectField({
  value,
  onValueChange,
  options,
  name,
  required,
  ...props
}: Omit<
  ComponentProps<typeof SelectTrigger>,
  'value' | 'onChange' | 'children'
> & {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  name?: string;
  required?: boolean;
}): ReactElement {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      items={options}
      name={name}
      required={required}
      disabled={props.disabled}
    >
      <SelectTrigger {...props}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
