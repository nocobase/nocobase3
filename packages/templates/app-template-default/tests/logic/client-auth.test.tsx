import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import { AuthBrand } from '../../client/extensions/nocobase-auth-ui/components/auth-brand.tsx';
import { AuthLayout } from '../../client/extensions/nocobase-auth-ui/components/auth-layout.tsx';
import { AuthMarketingPanel } from '../../client/extensions/nocobase-auth-ui/components/auth-marketing-panel.tsx';
import { PasswordLoginForm } from '../../client/extensions/nocobase-auth-ui/forms/password-login-form.tsx';

const passwordLoginAction = vi.hoisted(() => ({
  isPending: false,
  submit: vi.fn(),
}));

vi.mock('@nocobase/app-plugin-authentication/client/actions', () => ({
  usePasswordLogin: () => passwordLoginAction,
}));

describe('application authentication UI', () => {
  it('owns the authentication brand and page composition', () => {
    render(
      <AuthLayout
        description='Application sign in'
        form={<div>Application form</div>}
        logo={
          <AuthBrand
            light={<img alt='NocoBase' src='/assets/logo.png' />}
            dark={<img alt='NocoBase' src='/assets/logo-dark.png' />}
          />
        }
        marketing={<AuthMarketingPanel />}
        title='Welcome'
      />,
    );

    const brand = screen.getByLabelText('NocoBase');
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
    passwordLoginAction.submit.mockClear();
    render(<PasswordLoginForm />);

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
    expect(passwordLoginAction.submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordLoginAction.submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(passwordLoginAction.submit).toHaveBeenCalledWith({
        identifier: 'alice',
        password: 'password',
      });
    });
  });
});
