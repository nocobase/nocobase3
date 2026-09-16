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

  it('switches off the page it covers, and nothing outside it', () => {
    render(
      <div>
        <button type='button'>Sidebar</button>
        <div data-testid='content-area'>
          <button type='button'>Covered by the layer</button>
          <RouteChildPage>
            <button type='button'>Child page action</button>
          </RouteChildPage>
        </div>
      </div>,
    );

    // Covering a page does not close it, so without `inert` its controls stay in the tab order behind opaque paint.
    expect(screen.getByText('Covered by the layer')).toHaveAttribute('inert');
    // Only what the layer covers. The sidebar is outside the content area, which is why this is not a modal.
    expect(screen.getByText('Sidebar')).not.toHaveAttribute('inert');
    expect(screen.getByText('Child page action')).not.toHaveAttribute('inert');
  });

  it('gives the page beneath back when the layer closes', () => {
    const { rerender } = render(
      <div>
        <button type='button'>Covered by the layer</button>
        <RouteChildPage>
          <p>Child page content</p>
        </RouteChildPage>
      </div>,
    );

    expect(screen.getByText('Covered by the layer')).toHaveAttribute('inert');

    rerender(
      <div>
        <button type='button'>Covered by the layer</button>
      </div>,
    );

    expect(screen.getByText('Covered by the layer')).not.toHaveAttribute(
      'inert',
    );
  });

  it('leaves a deeper layer to restore what it marked', () => {
    const { rerender } = render(
      <div>
        <button type='button'>Parent page action</button>
        <RouteChildPage>
          <p>First layer</p>
        </RouteChildPage>
        <RouteChildPage>
          <p>Second layer</p>
        </RouteChildPage>
      </div>,
    );

    const first = screen.getByText('First layer').parentElement!;
    expect(screen.getByText('Parent page action')).toHaveAttribute('inert');
    // The second layer covers the first, so it switches that one off too.
    expect(first).toHaveAttribute('inert');

    rerender(
      <div>
        <button type='button'>Parent page action</button>
        <RouteChildPage>
          <p>First layer</p>
        </RouteChildPage>
      </div>,
    );

    // Closing the deeper layer restores only what it marked; the parent page stays covered by the layer still open.
    expect(screen.getByText('First layer').parentElement!).not.toHaveAttribute(
      'inert',
    );
    expect(screen.getByText('Parent page action')).toHaveAttribute('inert');
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
