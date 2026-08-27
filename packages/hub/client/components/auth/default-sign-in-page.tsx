import { AuthLayout } from '@/components/auth/auth-layout';
import { BasicSignInForm } from '@/components/auth/basic-sign-in-form';

export function DefaultSignInPage() {
  return (
    <AuthLayout
      title='Welcome back'
      description='Sign in to the independent NocoBase 3 Hub.'
    >
      <BasicSignInForm />
    </AuthLayout>
  );
}
