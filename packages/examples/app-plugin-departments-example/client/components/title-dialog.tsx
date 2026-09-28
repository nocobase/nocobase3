import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button } from './ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';
import { Input } from './ui/input.js';

/** Asks for a department title: a new department's, or a new one for a rename. */
export function TitleDialog({
  title,
  initialValue = '',
  submitLabel,
  busy = false,
  error,
  onSubmit,
  onCancel,
}: {
  title: string;
  initialValue?: string;
  submitLabel: string;
  busy?: boolean;
  error?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  function submit(event: FormEvent): void {
    event.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form className='space-y-4' onSubmit={submit}>
          <label className='block space-y-1.5 text-sm font-medium'>
            <span>{t('dialog.titleLabel')}</span>
            <Input
              autoFocus
              maxLength={255}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          {error ? (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          ) : null}
          <div className='flex justify-end gap-2'>
            <Button type='button' variant='outline' onClick={onCancel}>
              {t('dialog.cancel')}
            </Button>
            <Button type='submit' disabled={busy || !value.trim()}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
