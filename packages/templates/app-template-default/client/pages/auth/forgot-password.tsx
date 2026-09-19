import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { AuthLayout } from '../../extensions/nocobase-auth-ui/components/auth-layout.js';
import { PasswordResetRequestForm } from '../../extensions/nocobase-auth-ui/forms/password-reset-request-form.js';
import { authLogo, authMarketing } from './shared.js';

export default function ForgotPasswordPage(): ReactElement {
  const { t } = useTranslation();

  return (
    <AuthLayout
      description={t('auth.forgotDescription', {
        defaultValue:
          'Enter your email and we will send a reset link if the account exists.',
      })}
      form={<PasswordResetRequestForm />}
      logo={authLogo}
      marketing={authMarketing}
      title={t('auth.forgotTitle', { defaultValue: 'Forgot password' })}
    />
  );
}
