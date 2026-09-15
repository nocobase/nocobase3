import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RouteChildPage } from '../../client/components/route-child-page.js';

describe('RouteChildPage', () => {
  it('lays itself over the content area without becoming a dialog', () => {
    render(
      <RouteChildPage>
        <p>Child page content</p>
      </RouteChildPage>,
    );

    const layer = screen.getByText('Child page content').parentElement;
    // Positioned against the layout's main, which is what makes it cover the content area rather than the app.
    expect(layer).toHaveClass('absolute', 'inset-0');
    // Not modal: the user stays on a page of the application and must still reach the sidebar.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(layer).not.toHaveAttribute('aria-modal');
  });
});
