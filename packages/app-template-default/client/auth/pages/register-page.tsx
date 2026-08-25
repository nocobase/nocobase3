import {
  AuthLink,
  RegisterForm,
} from '@nocobase/app-plugin-authentication/client/ui';
import type { ReactElement } from 'react';

import { AuthLayout } from '../components/auth-layout';

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
      <RegisterForm />
    </AuthLayout>
  );
}
