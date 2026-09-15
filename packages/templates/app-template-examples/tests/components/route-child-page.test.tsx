import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RouteChildPage } from '../../client/components/route-child-page.js';

describe('RouteChildPage', () => {
  it('covers the content area and scrolls its own content', () => {
    render(
      <RouteChildPage>
        <p>Child page content</p>
      </RouteChildPage>,
    );

    const layer = screen.getByText('Child page content').parentElement!;

    // Positioned against the layout's main, so it covers the content area rather than the whole application.
    expect(layer).toHaveClass('absolute', 'inset-0');
    // It scrolls itself, which is why a deeper layer is rendered beside it rather than inside it.
    expect(layer).toHaveClass('overflow-y-auto');
  });

  it('is not modal, so the rest of the application stays reachable', () => {
    render(
      <RouteChildPage>
        <p>Child page content</p>
      </RouteChildPage>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByText('Child page content').closest('[aria-modal]'),
    ).toBeNull();
  });
});
