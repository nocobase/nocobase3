import type { ReactElement } from 'react';

import { PasswordResetRequestForm } from '../fallback-ui/password-reset-request-form.js';
import { AuthLink } from '../ui/index.js';
import { DefaultAuthLayout } from './default-auth-layout.js';

export default function ForgotPasswordPage(): ReactElement {
  return (
    <DefaultAuthLayout
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
      <PasswordResetRequestForm />
    </DefaultAuthLayout>
  );
}
