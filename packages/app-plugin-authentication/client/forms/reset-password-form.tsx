import { Button, Input, Label } from '@nocobase/app-client/ui';
import { useUpdatePassword } from '@refinedev/core';
import { useState, type FormEvent, type ReactElement } from 'react';

import { FormMessage } from '../components/form-message.js';

interface ResetPasswordVariables {
  readonly newPassword: string;
  readonly token: string;
}

export function ResetPasswordForm(): ReactElement {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [confirmation, setConfirmation] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [validationError, setValidationError] = useState<string>();
  const {
    data,
    error,
    isPending,
    mutate: updatePassword,
  } = useUpdatePassword<ResetPasswordVariables>();
  const errorMessage =
    validationError ??
    (!token
      ? 'This password reset link is invalid or has expired.'
      : undefined) ??
    data?.error?.message ??
    error?.message;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!token) {
      return;
    }
    if (newPassword !== confirmation) {
      setValidationError("Passwords don't match.");
      return;
    }
    setValidationError(undefined);
    updatePassword({ newPassword, token });
  };

  return (
    <form className='space-y-5' onSubmit={handleSubmit}>
      <div className='space-y-2'>
        <Label htmlFor='new-password'>New password</Label>
        <Input
          id='new-password'
          autoComplete='new-password'
          disabled={!token}
          onChange={(event) => setNewPassword(event.target.value)}
          required
          type='password'
          value={newPassword}
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
        <FormMessage type='error'>{errorMessage}</FormMessage>
      ) : null}
      <Button className='w-full' disabled={!token || isPending} type='submit'>
        {isPending ? 'Resetting…' : 'Reset password'}
      </Button>
    </form>
  );
}
