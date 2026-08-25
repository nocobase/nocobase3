import { useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { usePasswordLogin } from '../actions/index.js';
import { FormStatus } from './form-status.js';

export function PasswordLoginForm(): ReactElement {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const action = usePasswordLogin();

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void action.submit({ identifier, password });
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
      {action.error ? (
        <FormStatus type='error'>{action.error.message}</FormStatus>
      ) : null}
      <Button className='w-full' disabled={action.isPending} type='submit'>
        {action.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
