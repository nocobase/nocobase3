import { Button, Input, Label } from '@nocobase/app-client/ui';
import { useLogin } from '@refinedev/core';
import { useState, type FormEvent, type ReactElement } from 'react';

import { AuthLink } from '../components/auth-link.js';
import { FormMessage } from '../components/form-message.js';

interface LoginVariables {
  readonly identifier: string;
  readonly password: string;
}

export function LoginForm(): ReactElement {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const { data, error, isPending, mutate: login } = useLogin<LoginVariables>();
  const errorMessage = data?.error?.message ?? error?.message;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    login({ identifier, password });
  };

  return (
    <form className='space-y-5' onSubmit={handleSubmit}>
      <div className='space-y-2'>
        <Label htmlFor='identifier'>Username or email</Label>
        <Input
          id='identifier'
          autoComplete='username'
          autoFocus
          onChange={(event) => setIdentifier(event.target.value)}
          required
          value={identifier}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='password'>Password</Label>
        <Input
          id='password'
          autoComplete='current-password'
          onChange={(event) => setPassword(event.target.value)}
          required
          type='password'
          value={password}
        />
      </div>
      {errorMessage ? (
        <FormMessage type='error'>{errorMessage}</FormMessage>
      ) : null}
      <Button className='w-full' disabled={isPending} type='submit'>
        {isPending ? 'Signing in…' : 'Sign in'}
      </Button>
      <nav className='flex items-center justify-between text-sm text-muted-foreground'>
        <AuthLink
          className='hover:text-foreground hover:underline'
          to='/forgot-password'
        >
          Forgot password?
        </AuthLink>
        <AuthLink
          className='font-semibold text-foreground underline underline-offset-4'
          to='/register'
        >
          Sign up
        </AuthLink>
      </nav>
    </form>
  );
}
