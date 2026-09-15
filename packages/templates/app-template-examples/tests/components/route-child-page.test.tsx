import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RouteChildPage } from '../../client/components/route-child-page.js';

describe('RouteChildPage', () => {
  it('positions and scrolls in separate elements', () => {
    render(
      <RouteChildPage>
        <p>Child page content</p>
      </RouteChildPage>,
    );

    const scroller = screen.getByText('Child page content').parentElement!;
    const positioner = scroller.parentElement!;

    // The outer element positions against the layout's main and must not scroll: a deeper layer resolves
    // `inset-0` against it, and a scroll here would carry that layer out of sight.
    expect(positioner).toHaveClass('absolute', 'inset-0', 'overflow-hidden');
    expect(positioner).not.toHaveClass('overflow-y-auto');

    // The inner element scrolls and must not position, or it would become the deeper layer's anchor instead.
    expect(scroller).toHaveClass('h-full', 'overflow-y-auto');
    expect(scroller).not.toHaveClass('absolute');
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
