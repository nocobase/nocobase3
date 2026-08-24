import { LoginForm } from '@nocobase/app-plugin-authentication/client/ui';
import type { ReactElement } from 'react';

import { AuthLayout } from '../components/auth-layout';

export default function LoginPage(): ReactElement {
  return (
    <AuthLayout
      description='Sign in with your username or email and password.'
      title='Welcome back'
    >
      <LoginForm />
    </AuthLayout>
  );
}
