import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import reactWrappers from '../client/react-wrappers.js';

vi.mock('sonner', () => ({
  Toaster: () => <div data-testid='sonner-toaster' />,
}));

describe('client React wrappers', () => {
  it('mounts the notification host around application content', () => {
    const Provider = reactWrappers[0].component;

    render(
      <Provider>
        <div>Application content</div>
      </Provider>,
    );

    expect(screen.getByText('Application content')).toBeInTheDocument();
    expect(screen.getByTestId('sonner-toaster')).toBeInTheDocument();
  });

  it('declares a stable provider contribution', () => {
    expect(reactWrappers).toMatchObject([
      {
        name: 'notification-host',
      },
    ]);
    expect(Object.isFrozen(reactWrappers)).toBe(true);
  });
});
