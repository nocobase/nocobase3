import type { ReactElement } from 'react';

import { PasswordResetForm } from '../fallback-ui/password-reset-form.js';
import { AuthLink } from '../ui/index.js';
import { DefaultAuthLayout } from './default-auth-layout.js';

export default function ResetPasswordPage(): ReactElement {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  return (
    <DefaultAuthLayout
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
    </DefaultAuthLayout>
  );
}
