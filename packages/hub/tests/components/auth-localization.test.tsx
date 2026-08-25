import { render, screen } from '@testing-library/react';
import { Refine } from '@refinedev/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { i18n, i18nProvider } from '@nocobase/app-portal-sdk/i18n';

import { BasicSignInForm } from '@/components/auth/basic-sign-in-form';
import { AuthDemoPage } from '@/components/auth/demo';
import { AuthMethodDemo } from '@/components/auth/demo/auth-method-demo';
import { DefaultSignInPage } from '@/components/auth/default-sign-in-page';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { SignUpForm } from '@/components/auth/sign-up-form';
import '@/locales';
import { portalI18nReady } from '@/providers/i18n/runtime';

const authenticator = {
  name: 'password',
  authType: 'Email/Password',
  title: 'Password',
  options: {
    allowSignUp: true,
    enableResetPassword: true,
    signupForm: [],
  },
};

const { usePublicAuthenticators } = vi.hoisted(() => ({
  usePublicAuthenticators: vi.fn(),
}));

vi.mock('@nocobase/app-portal-sdk/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  usePublicAuthenticators,
}));

function renderWithAuth(element: React.ReactNode, initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Refine
        i18nProvider={i18nProvider}
        authProvider={{
          login: async () => ({ success: true }),
          logout: async () => ({ success: true }),
          check: async () => ({ authenticated: false }),
          onError: async () => ({}),
          register: async () => ({ success: true }),
          forgotPassword: async () => ({ success: true }),
        }}
      >
        {element}
      </Refine>
    </MemoryRouter>,
  );
}

describe('authentication localization', () => {
  beforeEach(async () => {
    usePublicAuthenticators.mockReturnValue({
      data: [authenticator],
      error: null,
      isPending: false,
    });
    await portalI18nReady;
    await i18n.changeLanguage('zh-CN');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en-US');
  });

  it('localizes the basic sign-in form', () => {
    renderWithAuth(<BasicSignInForm authenticator={authenticator} />);

    expect(screen.getByLabelText('用户名或邮箱')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
    expect(screen.getByText('忘记密码？')).toBeInTheDocument();
    expect(screen.queryByText('Username or email')).not.toBeInTheDocument();
  });

  it('localizes the default sign-in page and available methods', () => {
    renderWithAuth(<DefaultSignInPage />);

    expect(
      screen.getByRole('heading', { name: '欢迎回来' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('请选择 NocoBase 中已配置的登录方式。'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Welcome back')).not.toBeInTheDocument();
  });

  it('localizes the sign-up page', () => {
    renderWithAuth(<SignUpForm />, '/register?name=password');

    expect(
      screen.getByRole('heading', { name: '创建账号' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByLabelText('确认密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '注册' })).toBeInTheDocument();
    expect(screen.queryByText('Create your account')).not.toBeInTheDocument();
  });

  it('localizes the forgot-password page', () => {
    renderWithAuth(<ForgotPasswordForm />, '/forgot-password?name=password');

    expect(
      screen.getByRole('heading', { name: '忘记密码' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '发送重置链接' }),
    ).toBeInTheDocument();
    expect(screen.getByText('返回登录')).toBeInTheDocument();
    expect(screen.queryByText('Forgot password')).not.toBeInTheDocument();
  });

  it('localizes the authentication development examples', () => {
    const { unmount } = renderWithAuth(<AuthDemoPage />);

    expect(
      screen.getByRole('heading', { name: '登录界面组合' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '动态登录' })).toBeInTheDocument();
    expect(screen.queryByText('Login composition')).not.toBeInTheDocument();

    unmount();
    renderWithAuth(
      <AuthMethodDemo
        authType='OIDC'
        description='Identity provider'
        methodName='Company SSO'
      >
        <div>OIDC</div>
      </AuthMethodDemo>,
    );

    expect(screen.getByText('认证')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Company SSO' }),
    ).toBeInTheDocument();
    expect(screen.getByText('默认组件')).toBeInTheDocument();
    expect(screen.queryByText('Default component')).not.toBeInTheDocument();
  });
});
