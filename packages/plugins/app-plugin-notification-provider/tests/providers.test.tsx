import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import reactProviders from '../client/react-providers.js';

describe('client React Providers', () => {
  it('mounts the Base UI toast viewport around application content', () => {
    const Provider = reactProviders[0].component;

    render(
      <Provider>
        <div>Application content</div>
      </Provider>,
    );

    expect(screen.getByText('Application content')).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="toast-viewport"]'),
    ).toBeInTheDocument();
  });

  it('declares a stable provider contribution', () => {
    expect(reactProviders).toMatchObject([
      {
        name: 'notification-host',
      },
    ]);
    expect(Object.isFrozen(reactProviders)).toBe(true);
  });
});
