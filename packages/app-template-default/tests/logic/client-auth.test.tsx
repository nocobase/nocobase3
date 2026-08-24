import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthLayout } from '../../client/auth/components/auth-layout.tsx';

describe('application authentication UI', () => {
  it('owns the authentication brand and page composition', () => {
    render(
      <AuthLayout description='Application sign in' title='Welcome'>
        <div>Application form</div>
      </AuthLayout>,
    );

    expect(
      screen.getByRole('img', { name: 'NocoBase Default App' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    expect(
      screen.getByRole('complementary', { name: 'About this application' }),
    ).toHaveClass('hidden', 'md:grid');
    expect(screen.getByText('Application form')).toBeVisible();
  });
});
