import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Loading } from '../src/ui/index.js';

describe('Loading', () => {
  it('renders an accessible loading status', () => {
    render(<Loading label='Loading page' />);

    expect(
      screen.getByRole('status', { name: 'Loading page' }),
    ).toBeInTheDocument();
  });

  it('supports the standard fullscreen presentation', () => {
    render(<Loading fullscreen />);

    expect(screen.getByRole('status')).toHaveClass(
      'min-h-svh',
      'w-full',
      'bg-background',
    );
  });
});
