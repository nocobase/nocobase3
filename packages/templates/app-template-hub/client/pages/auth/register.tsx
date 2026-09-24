import { useSignUpAvailable } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Navigate } from 'react-router';

import { AuthLayout } from '../../extensions/nocobase-auth-ui/components/auth-layout.js';
import { PasswordRegistrationForm } from '../../extensions/nocobase-auth-ui/forms/password-registration-form.js';
import { authLogo, authMarketing } from './shared.js';

export default function RegisterPage(): ReactElement {
  const { t } = useTranslation();
  const signUpAvailable = useSignUpAvailable();
  // The page stays so registration can be turned back on; while the server refuses sign-up it only redirects.
  if (!signUpAvailable) return <Navigate replace to='/login' />;

  return (
    <AuthLayout
      description={t('auth.registerDescription', {
        defaultValue: 'Create an account to get started.',
      })}
      form={<PasswordRegistrationForm />}
      logo={authLogo}
      marketing={authMarketing}
      title={t('auth.registerTitle', { defaultValue: 'Create an account' })}
    />
  );
}
