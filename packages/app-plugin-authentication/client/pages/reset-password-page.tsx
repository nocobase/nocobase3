import type { ReactElement } from 'react';

import { AuthLink } from '../components/auth-link.js';
import { AuthPageShell } from '../components/auth-page-shell.js';
import { ResetPasswordForm } from '../forms/reset-password-form.js';

export default function ResetPasswordPage(): ReactElement {
  return (
    <AuthPageShell
      description='Choose a new password for your account.'
      footer={
        <p className='text-center text-muted-foreground'>
          Return to{' '}
          <AuthLink
            className='font-semibold text-foreground underline underline-offset-4'
            to='/login'
          >
            sign in
          </AuthLink>
        </p>
      }
      title='Reset password'
    >
      <ResetPasswordForm />
    </AuthPageShell>
  );
}
