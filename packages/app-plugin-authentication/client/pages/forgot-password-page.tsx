import type { ReactElement } from 'react';

import { AuthLink } from '../components/auth-link.js';
import { AuthPageShell } from '../components/auth-page-shell.js';
import { ForgotPasswordForm } from '../forms/forgot-password-form.js';

export default function ForgotPasswordPage(): ReactElement {
  return (
    <AuthPageShell
      description='Enter your email and we will send a reset link if the account exists.'
      footer={
        <p className='text-center text-muted-foreground'>
          Remember your password?{' '}
          <AuthLink
            className='font-semibold text-foreground underline underline-offset-4'
            to='/login'
          >
            Sign in
          </AuthLink>
        </p>
      }
      title='Forgot password'
    >
      <ForgotPasswordForm />
    </AuthPageShell>
  );
}
