import { Button, Input, Label } from '@nocobase/ui';
import { useState, type FormEvent, type ReactElement } from 'react';

import { usePasswordReset } from '../actions/index.js';
import { FormStatus } from './form-status.js';

interface PasswordResetFormProps {
  readonly token: string;
}

export function PasswordResetForm({
  token,
}: PasswordResetFormProps): ReactElement {
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<string>();
  const action = usePasswordReset();
  const errorMessage =
    validationError ??
    (!token
      ? 'This password reset link is invalid or has expired.'
      : undefined) ??
    action.error?.message;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!token) return;
    if (password !== confirmation) {
      setValidationError("Passwords don't match.");
      return;
    }
    setValidationError(undefined);
    void action.submit({ password, token });
  };

  return (
    <form className='space-y-5' onSubmit={handleSubmit}>
      <div className='space-y-2'>
        <Label htmlFor='new-password'>New password</Label>
        <Input
          id='new-password'
          autoComplete='new-password'
          disabled={!token}
          onChange={(event) => setPassword(event.target.value)}
          required
          type='password'
          value={password}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='confirm-new-password'>Confirm new password</Label>
        <Input
          id='confirm-new-password'
          autoComplete='new-password'
          disabled={!token}
          onChange={(event) => setConfirmation(event.target.value)}
          required
          type='password'
          value={confirmation}
        />
      </div>
      {errorMessage ? (
        <FormStatus type='error'>{errorMessage}</FormStatus>
      ) : null}
      <Button
        className='w-full'
        disabled={!token || action.isPending}
        type='submit'
      >
        {action.isPending ? 'Resetting…' : 'Reset password'}
      </Button>
    </form>
  );
}
