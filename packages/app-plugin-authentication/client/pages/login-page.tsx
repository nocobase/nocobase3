import type { ReactElement } from 'react';

import { AuthPageShell } from '../components/auth-page-shell.js';
import { LoginForm } from '../forms/login-form.js';

export default function LoginPage(): ReactElement {
  return (
    <AuthPageShell
      description='Sign in with your username or email and password.'
      title='Welcome back'
    >
      <LoginForm />
    </AuthPageShell>
  );
}
