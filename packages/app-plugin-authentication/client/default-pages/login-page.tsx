import type { ReactElement } from 'react';

import { PasswordLoginForm } from '../fallback-ui/password-login-form.js';
import { AuthLink } from '../ui/index.js';
import { DefaultAuthLayout } from './default-auth-layout.js';

export default function LoginPage(): ReactElement {
  return (
    <DefaultAuthLayout
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
    </DefaultAuthLayout>
  );
}
