import {
  AuthLink,
  ResetPasswordForm,
} from '@nocobase/app-plugin-authentication/client/ui';
import type { ReactElement } from 'react';

import { AuthLayout } from '../components/auth-layout';

export default function ResetPasswordPage(): ReactElement {
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
      <ResetPasswordForm />
    </AuthLayout>
  );
}
