import { AuthLink } from '@nocobase/app-plugin-authentication/client/ui';
import type { ReactElement } from 'react';

import { AuthLayout } from '../components/auth-layout';
import { PasswordResetForm } from '../forms/password-reset-form';

export default function ResetPasswordPage(): ReactElement {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  return (
    <AuthLayout
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
      <PasswordResetForm token={token} />
    </AuthLayout>
  );
}
