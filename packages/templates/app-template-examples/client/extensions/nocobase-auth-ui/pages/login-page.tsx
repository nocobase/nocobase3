import { AuthLink } from '@nocobase/app-plugin-authentication/client/ui';
import type { ReactElement } from 'react';

import { AuthLayout } from '../components/auth-layout';
import { PasswordLoginForm } from '../forms/password-login-form';

export default function LoginPage(): ReactElement {
  return (
    <AuthLayout
      description='Sign in with your username or email and password.'
      footer={
        <nav className='flex items-center justify-between text-muted-foreground'>
          <AuthLink
            className='hover:text-foreground hover:underline'
            to='/forgot-password'
          >
            Forgot password?
          </AuthLink>
          <AuthLink
            className='font-semibold text-foreground underline underline-offset-4'
            to='/register'
          >
            Sign up
          </AuthLink>
        </nav>
      }
      title='Welcome back'
    >
      <PasswordLoginForm />
    </AuthLayout>
  );
}
