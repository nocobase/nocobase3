import type { ReactElement } from 'react';

import { AuthLayout } from '../../extensions/nocobase-auth-ui/components/auth-layout.js';
import { PasswordResetRequestForm } from '../../extensions/nocobase-auth-ui/forms/password-reset-request-form.js';
import { authLogo, authMarketing } from './shared.js';

export default function ForgotPasswordPage(): ReactElement {
  return (
    <AuthLayout
      description='Enter your email and we will send a reset link if the account exists.'
      form={<PasswordResetRequestForm />}
      logo={authLogo}
      marketing={authMarketing}
      title='Forgot password'
    />
  );
}
