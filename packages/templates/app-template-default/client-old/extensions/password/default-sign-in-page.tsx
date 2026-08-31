import { AuthLayout } from '@/extensions/password/auth-layout';
import { BasicSignInForm } from '@/extensions/password/basic-sign-in-form';

export function DefaultSignInPage() {
  return (
    <AuthLayout
      title='Welcome back'
      description='Sign in with your username or email and password.'
    >
      <BasicSignInForm />
    </AuthLayout>
  );
}
