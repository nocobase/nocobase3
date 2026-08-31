import { Refine, type AuthProvider } from '@refinedev/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import { AuthLayout } from '../../client/extensions/nocobase-auth-ui/components/auth-layout.tsx';
import { PasswordLoginForm } from '../../client/extensions/nocobase-auth-ui/forms/password-login-form.tsx';

describe('application authentication UI', () => {
  it('owns the authentication brand and page composition', () => {
    render(
      <AuthLayout description='Application sign in' title='Welcome'>
        <div>Application form</div>
      </AuthLayout>,
    );

    const brand = screen.getByRole('img', { name: 'NocoBase' });
    expect(brand).toBeVisible();
    expect(
      brand.querySelector('img[src="/assets/logo.png"]'),
    ).toBeInTheDocument();
    expect(
      brand.querySelector('img[src="/assets/logo-dark.png"]'),
    ).toBeInTheDocument();
    expect(brand.querySelector('svg')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    expect(
      screen.getByRole('complementary', { name: 'About this application' }),
    ).toHaveClass('hidden', 'md:grid');
    expect(screen.getByText('AI-native application platform')).toBeVisible();
    expect(screen.getByText('AI-native frontend')).toBeVisible();
    expect(screen.getByText('NocoBase foundation')).toBeVisible();
    expect(screen.getByText('Freedom above. Confidence below.')).toBeVisible();
    expect(screen.getByText('Application form')).toBeVisible();
  });

  it('owns the final login form while using the plugin authentication action', async () => {
    const login = vi
      .fn<AuthProvider['login']>()
      .mockResolvedValue({ success: true });

    render(
      <Refine authProvider={createAuthProvider({ login })}>
        <PasswordLoginForm />
      </Refine>,
    );

    fireEvent.change(screen.getByLabelText('Username or email'), {
      target: { value: 'alice' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password' },
    });

    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(login).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(login).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        identifier: 'alice',
        password: 'password',
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
