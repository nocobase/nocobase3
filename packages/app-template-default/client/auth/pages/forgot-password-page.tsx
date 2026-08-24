import {
  AuthLink,
  ForgotPasswordForm,
} from '@nocobase/app-plugin-authentication/client/ui';
import type { ReactElement } from 'react';

import { AuthLayout } from '../components/auth-layout';

export default function ForgotPasswordPage(): ReactElement {
  return (
    <AuthLayout
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
    </AuthLayout>
  );
}
