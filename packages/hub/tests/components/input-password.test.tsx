import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { i18n } from '@nocobase/app-portal-sdk/i18n';

import '@/locales';
import { InputPassword } from '@/components/auth/input-password';
import { portalI18nReady } from '@/providers/i18n/runtime';

describe('InputPassword', () => {
  it('reveals and hides the password without changing its value', async () => {
    const user = userEvent.setup();

    render(
      <InputPassword
        aria-label='Password'
        defaultValue='correct horse battery staple'
      />,
    );

    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('correct horse battery staple');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue('correct horse battery staple');
  });

  it('localizes the password visibility control', async () => {
    await portalI18nReady;
    await i18n.changeLanguage('zh-CN');

    render(<InputPassword aria-label='密码' />);

    expect(
      screen.getByRole('button', { name: '显示密码' }),
    ).toBeInTheDocument();

    await i18n.changeLanguage('en-US');
  });
});
