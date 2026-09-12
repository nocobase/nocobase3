import type { ReactElement } from 'react';

import { PasswordRegistrationForm } from '../fallback-ui/password-registration-form.js';
import { AuthLink } from '../ui/index.js';
import { DefaultAuthLayout } from './default-auth-layout.js';

export default function RegisterPage(): ReactElement {
  return (
    <DefaultAuthLayout
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
    </DefaultAuthLayout>
  );
}
