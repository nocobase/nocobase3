import { Button, Input, Label } from '@nocobase/app-client/ui';
import { useForgotPassword } from '@refinedev/core';
import { useState, type FormEvent, type ReactElement } from 'react';

import { FormMessage } from '../components/form-message.js';

interface ForgotPasswordVariables {
  readonly email: string;
}

export function ForgotPasswordForm(): ReactElement {
  const [email, setEmail] = useState('');
  const {
    data,
    error,
    isPending,
    mutate: forgotPassword,
  } = useForgotPassword<ForgotPasswordVariables>();
  const errorMessage = data?.error?.message ?? error?.message;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    forgotPassword({ email });
  };

  return (
    <form className='space-y-5' onSubmit={handleSubmit}>
      <div className='space-y-2'>
        <Label htmlFor='email'>Email</Label>
        <Input
          id='email'
          autoComplete='email'
          autoFocus
          onChange={(event) => setEmail(event.target.value)}
          required
          type='email'
          value={email}
        />
      </div>
      {errorMessage ? (
        <FormMessage type='error'>{errorMessage}</FormMessage>
      ) : data?.success ? (
        <FormMessage type='success'>
          If the account exists, a reset link has been sent.
        </FormMessage>
      ) : null}
      <Button className='w-full' disabled={isPending} type='submit'>
        {isPending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
