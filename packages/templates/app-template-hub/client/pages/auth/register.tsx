import type { ReactElement } from 'react';

import { AuthLayout } from '../../extensions/nocobase-auth-ui/components/auth-layout.js';
import { PasswordRegistrationForm } from '../../extensions/nocobase-auth-ui/forms/password-registration-form.js';
import { authLogo, authMarketing } from './shared.js';

export default function RegisterPage(): ReactElement {
  return (
    <AuthLayout
      description='Create an account to get started.'
      form={<PasswordRegistrationForm />}
      logo={authLogo}
      marketing={authMarketing}
      title='Create an account'
    />
  );
}
