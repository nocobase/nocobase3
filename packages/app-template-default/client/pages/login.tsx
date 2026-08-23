import { Button, Input, Label } from '@nocobase/app-client/ui';
import { useLogin } from '@refinedev/core';
import { useState, type FormEvent, type ReactElement } from 'react';

interface LoginVariables {
  identifier: string;
  password: string;
}

export function LoginPage(): ReactElement {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const { mutate: login, isPending } = useLogin<LoginVariables>();

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    login({ identifier, password });
  };

  return (
    <main className='grid min-h-svh place-items-center px-6 py-12'>
      <section className='w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm'>
        <header className='mb-8 space-y-2'>
          <p className='text-sm font-medium text-muted-foreground'>NocoBase</p>
          <h1 className='text-2xl font-semibold tracking-tight'>Sign in</h1>
          <p className='text-sm text-muted-foreground'>
            Sign in with your username or email and password.
          </p>
        </header>

        <form className='space-y-5' onSubmit={handleSubmit}>
          <div className='space-y-2'>
            <Label htmlFor='identifier'>Username or email</Label>
            <Input
              id='identifier'
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete='username'
              autoFocus
              required
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='password'>Password</Label>
            <Input
              id='password'
              type='password'
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete='current-password'
              required
            />
          </div>

          <Button type='submit' className='w-full' disabled={isPending}>
            {isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </section>
    </main>
  );
}
