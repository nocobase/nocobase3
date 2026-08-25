import type { RenderAuthenticator } from '@nocobase/app-portal-sdk/auth';
import { useTranslate } from '@refinedev/core';

import { AuthLayout } from '@/components/auth/auth-layout';
import { DynamicSignIn } from '@/components/auth/dynamic-sign-in';

type DefaultSignInPageProps = {
  renderAuthenticator?: RenderAuthenticator;
};

export function DefaultSignInPage({
  renderAuthenticator,
}: DefaultSignInPageProps) {
  const translate = useTranslate();
  return (
    <AuthLayout
      title={translate('auth.welcomeBack', 'Welcome back')}
      description={translate(
        'auth.welcomeBackDescription',
        'Choose a sign-in method configured in NocoBase.',
      )}
    >
      <DynamicSignIn renderAuthenticator={renderAuthenticator} />
    </AuthLayout>
  );
}
