import type { ReactElement } from 'react';

import { AuthLayout } from '../../extensions/nocobase-auth-ui/components/auth-layout.js';
import { PasswordLoginForm } from '../../extensions/nocobase-auth-ui/forms/password-login-form.js';
import { authLogo, authMarketing } from './shared.js';

export default function LoginPage(): ReactElement {
  return (
    <AuthLayout
      description='Sign in with your username or email and password.'
      form={<PasswordLoginForm />}
      logo={authLogo}
      marketing={authMarketing}
      title='Welcome back'
    />
  );
}
