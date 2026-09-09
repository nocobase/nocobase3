import type { ReactElement } from 'react';
import { Input } from './ui/input.js';

export interface MailSyncPolicyValue {
  readonly receivedAfter: string;
  readonly maxMessages: number;
  readonly batchSize: number;
}

export interface MailSyncPolicyFieldsProps {
  readonly value: MailSyncPolicyValue;
  readonly labels: {
    readonly receivedAfter: string;
    readonly maxMessages: string;
    readonly batchSize: string;
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
    <div className='grid gap-4 sm:grid-cols-3'>
      <label className='text-sm font-medium'>
        {labels.receivedAfter}
        <Input
          className='mt-1'
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, receivedAfter: event.target.value })
          }
          type='date'
          value={value.receivedAfter}
        />
      </label>
      <label className='text-sm font-medium'>
        {labels.maxMessages}
        <Input
          className='mt-1'
          disabled={disabled}
          max={100000}
          min={1}
          onChange={(event) =>
            onChange({
              ...value,
              maxMessages: boundedInput(
                event.target.valueAsNumber,
                value.maxMessages,
                1,
                100_000,
              ),
            })
          }
          type='number'
          value={value.maxMessages}
        />
      </label>
      <label className='text-sm font-medium'>
        {labels.batchSize}
        <Input
          className='mt-1'
          disabled={disabled}
          max={500}
          min={1}
          onChange={(event) =>
            onChange({
              ...value,
              batchSize: boundedInput(
                event.target.valueAsNumber,
                value.batchSize,
                1,
                500,
              ),
            })
          }
          type='number'
          value={value.batchSize}
        />
      </label>
    </div>
  );
}

function boundedInput(
  next: number,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Number.isFinite(next)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(next)))
    : fallback;
}
