import { Refine, type AuthProvider } from '@refinedev/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ForgotPasswordForm } from '../forms/forgot-password-form.js';
import { LoginForm } from '../forms/login-form.js';
import { RegisterForm } from '../forms/register-form.js';
import { ResetPasswordForm } from '../forms/reset-password-form.js';
import LoginPage from '../pages/login-page.js';

describe('authentication forms', () => {
  it('renders the responsive authentication layout and product panel', () => {
    render(
      <Refine authProvider={createAuthProvider({})}>
        <LoginPage />
      </Refine>,
    );

    expect(screen.getByRole('img', { name: 'NocoBase' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Welcome back', level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByRole('complementary', { name: 'About NocoBase' }),
    ).toHaveClass('hidden', 'md:grid');
    expect(
      screen.getByRole('heading', {
        name: 'Let AI build freely. NocoBase keeps it reliable.',
        level: 2,
      }),
    ).toBeVisible();
    expect(screen.getByText('AI-native frontend')).toBeVisible();
    expect(screen.getByText('NocoBase foundation')).toBeVisible();
  });

  it('submits a username or email and password when signing in', async () => {
    const login = vi
      .fn<AuthProvider['login']>()
      .mockResolvedValue({ success: true });

    render(
      <Refine authProvider={createAuthProvider({ login })}>
        <LoginForm />
      </Refine>,
    );

    fireEvent.change(screen.getByLabelText('Username or email'), {
      target: { value: 'alice' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        identifier: 'alice',
        password: 'password',
      });
    });
  });

  it('validates password confirmation before registering', () => {
    const register = vi.fn<AuthProvider['register']>();

    render(
      <Refine authProvider={createAuthProvider({ register })}>
        <RegisterForm />
      </Refine>,
    );

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Alice' },
    });
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'alice' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password-one' },
    });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'password-two' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Passwords don't match.",
    );
    expect(register).not.toHaveBeenCalled();
  });

  it('submits a reset token with matching passwords', async () => {
    const updatePassword = vi
      .fn<NonNullable<AuthProvider['updatePassword']>>()
      .mockResolvedValue({ success: true });
    window.history.replaceState({}, '', '/reset-password?token=reset-token');

    render(
      <Refine authProvider={createAuthProvider({ updatePassword })}>
        <ResetPasswordForm />
      </Refine>,
    );

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'new-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    await waitFor(() => {
      expect(updatePassword).toHaveBeenCalledWith({
        newPassword: 'new-password',
        token: 'reset-token',
      });
    });
  });

  it('submits an email for a password reset request', async () => {
    const forgotPassword = vi
      .fn<NonNullable<AuthProvider['forgotPassword']>>()
      .mockResolvedValue({ success: true });

    render(
      <Refine authProvider={createAuthProvider({ forgotPassword })}>
        <ForgotPasswordForm />
      </Refine>,
    );

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => {
      expect(forgotPassword).toHaveBeenCalledWith({
        email: 'alice@example.com',
      });
    });
  });
});

function createAuthProvider(overrides: Partial<AuthProvider>): AuthProvider {
  return {
    check: async () => ({ authenticated: false }),
    getIdentity: async () => null,
    login: async () => ({ success: true }),
    logout: async () => ({ success: true }),
    onError: async (error) => ({ error }),
    ...overrides,
  };
}
