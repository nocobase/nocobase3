import { siGithub, siGoogle } from 'simple-icons';
import { useEffect, type ReactElement } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';

import { AuthBrand } from '../../../../registry/auth/auth-ui/components/auth-brand';
import { AuthSsoButtons } from '../../../../registry/auth/auth-ui/components/auth-sso-buttons';
import { AuthLayout } from '../../../../registry/auth/auth-ui/components/auth-layout';
import { AuthMarketingPanel } from '../../../../registry/auth/auth-ui/components/auth-marketing-panel';
import { PasswordLoginForm } from '../../../../registry/auth/auth-ui/forms/password-login-form';
import { PasswordRegistrationForm } from '../../../../registry/auth/auth-ui/forms/password-registration-form';
import { PasswordResetForm } from '../../../../registry/auth/auth-ui/forms/password-reset-form';
import { PasswordResetRequestForm } from '../../../../registry/auth/auth-ui/forms/password-reset-request-form';
import { LdapLoginForm } from './ldap-login-form';
import { SimpleIconGlyph } from './simple-icon';

const logo = (
  <AuthBrand
    light={
      <img
        alt='NocoBase'
        className='h-10 w-auto object-contain'
        src='/assets/logo.png'
      />
    }
    dark={
      <img
        alt='NocoBase'
        className='h-10 w-auto object-contain'
        src='/assets/logo-dark.png'
      />
    }
  />
);

const marketing = <AuthMarketingPanel />;

export function AuthenticationUiDemo(): ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AuthUiShell />} path='/demo/auth/auth-ui'>
          <Route element={<Navigate replace to='login' />} index />
          <Route element={<DemoLoginRoute />} path='login' />
          <Route element={<DemoRegisterRoute />} path='register' />
          <Route element={<DemoForgotPasswordRoute />} path='forgot-password' />
          <Route element={<DemoResetPasswordRoute />} path='reset-password' />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function DemoLoginRoute(): ReactElement {
  return (
    <AuthLayout
      description='Sign in with your username or email and password.'
      forms={[
        {
          content: <PasswordLoginForm />,
          id: 'password',
          label: 'Password',
        },
        {
          content: <LdapLoginForm />,
          id: 'ldap',
          label: 'LDAP',
        },
      ]}
      logo={logo}
      marketing={marketing}
      sso={
        <AuthSsoButtons
          providers={[
            {
              icon: <SimpleIconGlyph className='size-4' icon={siGoogle} />,
              id: 'google',
              label: 'Google',
              onClick: () => undefined,
            },
            {
              icon: (
                <SimpleIconGlyph
                  className='size-4 text-foreground'
                  icon={siGithub}
                />
              ),
              id: 'github',
              label: 'GitHub',
              onClick: () => undefined,
            },
          ]}
        />
      }
      title='Welcome back'
    />
  );
}

function DemoRegisterRoute(): ReactElement {
  return (
    <AuthLayout
      description='Create an account to get started.'
      form={<PasswordRegistrationForm />}
      logo={logo}
      marketing={marketing}
      title='Create an account'
    />
  );
}

function DemoForgotPasswordRoute(): ReactElement {
  return (
    <AuthLayout
      description='Enter your email and we will send a reset link if the account exists.'
      form={<PasswordResetRequestForm />}
      logo={logo}
      marketing={marketing}
      title='Forgot password'
    />
  );
}

function DemoResetPasswordRoute(): ReactElement {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  return (
    <AuthLayout
      description='Choose a new password for your account.'
      form={<PasswordResetForm token={token} />}
      logo={logo}
      marketing={marketing}
      title='Reset password'
    />
  );
}

function AuthUiShell(): ReactElement {
  const theme = new URLSearchParams(window.location.search).get('theme');

  useEffect(() => {
    if (theme !== 'dark' && theme !== 'light') return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <div className='min-h-svh bg-background'>
      <Outlet />
    </div>
  );
}
