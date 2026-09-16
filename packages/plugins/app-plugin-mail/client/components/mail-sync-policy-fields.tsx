import type { ReactElement } from 'react';
import { Input } from './ui/input.js';

export interface MailSyncPolicyValue {
  readonly receivedAfter: string;
}

export interface MailSyncPolicyFieldsProps {
  readonly value: MailSyncPolicyValue;
  readonly labels: {
    readonly receivedAfter: string;
  };
  readonly disabled?: boolean;
  readonly onChange: (value: MailSyncPolicyValue) => void;
}

export function MailSyncPolicyFields({
  value,
  labels,
  disabled = false,
  onChange,
}: MailSyncPolicyFieldsProps): ReactElement {
  return (
    <label className='grid max-w-sm gap-2 text-sm font-medium'>
      {labels.receivedAfter}
      <Input
        disabled={disabled}
        onChange={(event) =>
          onChange({ ...value, receivedAfter: event.target.value })
        }
        type='date'
        value={value.receivedAfter}
      />
    </label>
  );
}
