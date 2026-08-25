import { AuthLink } from '@nocobase/app-plugin-authentication/client/ui';
import type { ReactElement } from 'react';

import { AuthLayout } from '../components/auth-layout';
import { PasswordRegistrationForm } from '../forms/password-registration-form';

export default function RegisterPage(): ReactElement {
  return (
    <AuthLayout
      description='Create an account to get started.'
      footer={
        <p className='text-center text-muted-foreground'>
          Already have an account?{' '}
          <AuthLink
            className='font-semibold text-foreground underline underline-offset-4'
            to='/login'
          >
            Sign in
          </AuthLink>
        </p>
      }
      title='Create an account'
    >
      <PasswordRegistrationForm />
    </AuthLayout>
  );
}
