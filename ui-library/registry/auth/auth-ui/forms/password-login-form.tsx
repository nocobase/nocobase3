import { usePasswordLogin } from '@nocobase/app-plugin-authentication/client/actions';
import { Eye, EyeOff } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { FormStatus } from '../components/form-status';

export interface PasswordLoginAction {
  readonly error?: { readonly message: string };
  readonly isPending: boolean;
  readonly submit: (input: {
    readonly identifier: string;
    readonly password: string;
  }) => Promise<void>;
}

export interface PasswordLoginFormProps {
  readonly action?: PasswordLoginAction;
  readonly className?: string;
  readonly identifierLabel?: string;
  readonly passwordLabel?: string;
  readonly submitLabel?: string;
  readonly pendingLabel?: string;
}

export function PasswordLoginForm({
  action: actionOverride,
  className,
  identifierLabel = 'Username or email',
  passwordLabel = 'Password',
  submitLabel = 'Sign in',
  pendingLabel = 'Signing in…',
}: PasswordLoginFormProps = {}): ReactElement {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const defaultAction = usePasswordLogin();
  const action = actionOverride ?? defaultAction;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void action.submit({ identifier, password });
  };

  return (
    <form className={className ?? 'space-y-5'} onSubmit={handleSubmit}>
      <div className='space-y-2'>
        <Label htmlFor='identifier'>{identifierLabel}</Label>
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
        <Label htmlFor='password'>{passwordLabel}</Label>
        <div className='relative'>
          <Input
            id='password'
            autoComplete='current-password'
            className='pr-10'
            onChange={(event) => setPassword(event.target.value)}
            required
            type={isPasswordVisible ? 'text' : 'password'}
            value={password}
          />
          <button
            aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
            aria-pressed={isPasswordVisible}
            className='absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
            onClick={() => setIsPasswordVisible((visible) => !visible)}
            type='button'
          >
            {isPasswordVisible ? (
              <EyeOff aria-hidden='true' className='size-4' />
            ) : (
              <Eye aria-hidden='true' className='size-4' />
            )}
          </button>
        </div>
      </div>
      {action.error ? (
        <FormStatus type='error'>{action.error.message}</FormStatus>
      ) : null}
      <Button className='w-full' disabled={action.isPending} type='submit'>
        {action.isPending ? pendingLabel : submitLabel}
      </Button>
      <div className='pt-3 text-sm'>
        <nav className='flex items-center justify-between text-muted-foreground'>
          <a
            className='hover:text-foreground hover:underline'
            href='forgot-password'
          >
            Forgot password?
          </a>
          <a
            className='font-semibold text-foreground underline underline-offset-4'
            href='register'
          >
            Sign up
          </a>
        </nav>
      </div>
    </form>
  );
}
