import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import providers from '../client/providers.js';

vi.mock('sonner', () => ({
  Toaster: () => <div data-testid='sonner-toaster' />,
}));

describe('client providers', () => {
  it('mounts the notification host around application content', () => {
    const Provider = providers[0].component;

    render(
      <Provider>
        <div>Application content</div>
      </Provider>,
    );

    expect(screen.getByText('Application content')).toBeInTheDocument();
    expect(screen.getByTestId('sonner-toaster')).toBeInTheDocument();
  });

  it('declares a stable provider contribution', () => {
    expect(providers).toMatchObject([
      {
        name: 'notification-host',
      },
    ]);
    expect(Object.isFrozen(providers)).toBe(true);
  });
});
