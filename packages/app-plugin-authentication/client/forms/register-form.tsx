import { Button, Input, Label } from '@nocobase/app-client/ui';
import { useRegister } from '@refinedev/core';
import { useState, type FormEvent, type ReactElement } from 'react';

import { FormMessage } from '../components/form-message.js';

interface RegisterVariables {
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly username: string;
}

export function RegisterForm(): ReactElement {
  const [confirmation, setConfirmation] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [validationError, setValidationError] = useState<string>();
  const {
    data,
    error,
    isPending,
    mutate: register,
  } = useRegister<RegisterVariables>();
  const errorMessage =
    validationError ?? data?.error?.message ?? error?.message;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (password !== confirmation) {
      setValidationError("Passwords don't match.");
      return;
    }
    setValidationError(undefined);
    register({ email, name, password, username });
  };

  return (
    <form className='space-y-5' onSubmit={handleSubmit}>
      <div className='space-y-2'>
        <Label htmlFor='name'>Name</Label>
        <Input
          id='name'
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='username'>Username</Label>
        <Input
          id='username'
          autoComplete='username'
          onChange={(event) => setUsername(event.target.value)}
          required
          value={username}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='register-email'>Email</Label>
        <Input
          id='register-email'
          autoComplete='email'
          onChange={(event) => setEmail(event.target.value)}
          required
          type='email'
          value={email}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='register-password'>Password</Label>
        <Input
          id='register-password'
          autoComplete='new-password'
          onChange={(event) => setPassword(event.target.value)}
          required
          type='password'
          value={password}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='confirm-password'>Confirm password</Label>
        <Input
          id='confirm-password'
          autoComplete='new-password'
          onChange={(event) => setConfirmation(event.target.value)}
          required
          type='password'
          value={confirmation}
        />
      </div>
      {errorMessage ? (
        <FormMessage type='error'>{errorMessage}</FormMessage>
      ) : null}
      <Button className='w-full' disabled={isPending} type='submit'>
        {isPending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
