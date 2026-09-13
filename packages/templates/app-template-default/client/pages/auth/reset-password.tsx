import type { ReactElement } from 'react';

import { AuthLayout } from '../../extensions/nocobase-auth-ui/components/auth-layout.js';
import { PasswordResetForm } from '../../extensions/nocobase-auth-ui/forms/password-reset-form.js';
import { authLogo, authMarketing } from './shared.js';

export default function ResetPasswordPage(): ReactElement {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  return (
    <AuthLayout
      description='Choose a new password for your account.'
      form={<PasswordResetForm token={token} />}
      logo={authLogo}
      marketing={authMarketing}
      title='Reset password'
    />
  );
}
