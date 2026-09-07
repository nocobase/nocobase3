import { Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button.js';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group.js';
import { useState, type ReactElement } from 'react';
import type { ActivationPolicy } from './types.js';

export function Settings({
  activation,
  busy,
  onSave,
  onRemove,
}: {
  readonly activation: ActivationPolicy;
  readonly busy: boolean;
  readonly onSave: (activation: ActivationPolicy) => void;
  readonly onRemove: () => void;
}): ReactElement {
  const [value, setValue] = useState<ActivationPolicy>(activation);
  return (
    <div className='max-w-3xl space-y-5'>
      <div>
        <h2 className='font-semibold'>Application settings</h2>
        <p className='mt-1 text-sm leading-6 text-muted-foreground'>
          Choose how this application is activated after Hub starts. This is an
          application setting and is not changed by deployments.
        </p>
      </div>
      <form
        className='space-y-6'
        onSubmit={(event) => {
          event.preventDefault();
          onSave(value);
        }}
      >
        <div className='grid gap-2'>
          <label className='text-sm font-medium'>Startup</label>
          <p className='text-xs leading-5 text-muted-foreground'>
            Controls whether the application starts with Hub or waits for its
            first visit.
          </p>
          <RadioGroup
            className='mt-2 grid gap-4'
            disabled={busy}
            onValueChange={(next) => setValue(next as ActivationPolicy)}
            value={value}
          >
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${value === 'eager' ? 'border-primary bg-primary/5' : ''}`}
            >
              <RadioGroupItem className='mt-0.5' value='eager' />
              <span>
                <span className='block text-sm font-medium'>
                  Start with Hub
                </span>
                <span className='mt-1 block text-xs leading-5 text-muted-foreground'>
                  Start automatically after Hub starts and report Running when
                  activation completes.
                </span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${value === 'lazy' ? 'border-primary bg-primary/5' : ''}`}
            >
              <RadioGroupItem className='mt-0.5' value='lazy' />
              <span>
                <span className='block text-sm font-medium'>
                  Start on first visit
                </span>
                <span className='mt-1 block text-xs leading-5 text-muted-foreground'>
                  Register the route after Hub starts, remain Ready, and
                  activate when the application is first visited.
                </span>
              </span>
            </label>
          </RadioGroup>
        </div>
        <div className='flex justify-end border-t pt-5'>
          <Button disabled={busy || value === activation} type='submit'>
            {busy ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </form>
      <div className='border-t pt-6'>
        <h3 className='text-sm font-semibold text-destructive'>Danger zone</h3>
        <p className='mt-1 text-sm text-muted-foreground'>
          Permanently remove the application, its releases, configuration, and
          application data from this Hub.
        </p>
        <Button
          className='mt-4 border-destructive/40 text-destructive hover:bg-destructive/10'
          disabled={busy}
          onClick={onRemove}
          variant='outline'
        >
          <Trash2 className='size-4' /> Remove application
        </Button>
      </div>
    </div>
  );
}
