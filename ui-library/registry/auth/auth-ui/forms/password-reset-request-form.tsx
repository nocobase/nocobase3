import { usePasswordResetRequest } from '@nocobase/app-plugin-authentication/client/actions';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { FormStatus } from '../components/form-status';

export interface PasswordResetRequestAction {
  readonly error?: { readonly message: string };
  readonly isPending: boolean;
  readonly isSuccess: boolean;
  readonly submit: (input: { readonly email: string }) => Promise<void>;
}

export interface PasswordResetRequestFormProps {
  readonly action?: PasswordResetRequestAction;
  readonly className?: string;
  readonly submitLabel?: string;
  readonly pendingLabel?: string;
  readonly successMessage?: string;
}

export function PasswordResetRequestForm({
  action: actionOverride,
  className,
  submitLabel = 'Send reset link',
  pendingLabel = 'Sending…',
  successMessage = 'If the account exists, a reset link has been sent.',
}: PasswordResetRequestFormProps = {}): ReactElement {
  const [email, setEmail] = useState('');
  const defaultAction = usePasswordResetRequest();
  const action = actionOverride ?? defaultAction;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void action.submit({ email });
  };

  return (
    <form className={className ?? 'space-y-5'} onSubmit={handleSubmit}>
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
      {action.error ? (
        <FormStatus type='error'>{action.error.message}</FormStatus>
      ) : action.isSuccess ? (
        <FormStatus type='success'>{successMessage}</FormStatus>
      ) : null}
      <Button className='w-full' disabled={action.isPending} type='submit'>
        {action.isPending ? pendingLabel : submitLabel}
      </Button>
      <div className='pt-3 text-sm'>
        <p className='text-center text-muted-foreground'>
          Remember your password?{' '}
          <a
            className='font-semibold text-foreground underline underline-offset-4'
            href='login'
          >
            Sign in
          </a>
        </p>
      </div>
    </form>
  );
}
