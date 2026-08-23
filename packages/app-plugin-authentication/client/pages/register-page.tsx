import type { ReactElement } from 'react';

import { AuthLink } from '../components/auth-link.js';
import { AuthPageShell } from '../components/auth-page-shell.js';
import { RegisterForm } from '../forms/register-form.js';

export default function RegisterPage(): ReactElement {
  return (
    <AuthPageShell
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
    </AuthPageShell>
  );
}
