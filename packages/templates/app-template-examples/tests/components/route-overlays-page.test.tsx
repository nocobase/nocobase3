import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import RouteOverlaysPage from '../../client/pages/route-overlays/index.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('RouteOverlaysPage', () => {
  it('offers direct links to both nested overlay paths', () => {
    render(
      <MemoryRouter initialEntries={['/route-overlays']}>
        <Routes>
          <Route path='/route-overlays/*' element={<RouteOverlaysPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'routeOverlays.title', level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /routeOverlays\.openDialogDrawer/ }),
    ).toHaveAttribute('href', '/route-overlays/dialog/drawer');
    expect(
      screen.getByRole('button', { name: /routeOverlays\.openDrawerDialog/ }),
    ).toHaveAttribute('href', '/route-overlays/drawer/dialog');
  });
});
