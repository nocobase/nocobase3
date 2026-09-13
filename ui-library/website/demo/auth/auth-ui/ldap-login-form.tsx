import { useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LdapLoginForm(): ReactElement {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setIsPending(true);
    window.setTimeout(() => setIsPending(false), 700);
  };

  return (
    <form className='space-y-5' onSubmit={handleSubmit}>
      <div className='space-y-2'>
        <Label htmlFor='ldap-username'>LDAP username</Label>
        <Input
          id='ldap-username'
          autoComplete='username'
          autoFocus
          onChange={(event) => setUsername(event.target.value)}
          required
          value={username}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='ldap-password'>Password</Label>
        <Input
          id='ldap-password'
          autoComplete='current-password'
          onChange={(event) => setPassword(event.target.value)}
          required
          type='password'
          value={password}
        />
      </div>
      <Button className='w-full' disabled={isPending} type='submit'>
        {isPending ? 'Signing in…' : 'Sign in with LDAP'}
      </Button>
      <div className='pt-3 text-sm'>
        <p className='text-center text-muted-foreground'>
          LDAP authentication is configured by your administrator.
        </p>
      </div>
    </form>
  );
}
