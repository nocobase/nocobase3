/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  UNSAFE_LocationContext,
  useLocation,
  useNavigate,
} from 'react-router';
import { expect, test, vi } from 'vitest';

vi.mock('../client/page/knowledge-bases-page.tsx', () => ({
  default: () => <p>Knowledge base directory</p>,
}));

import { KnowledgeBaseSettingsPage } from '../client/settings-pages.tsx';

function OuterLocation(): ReactElement {
  const location = useLocation();
  return <output data-testid='outer-path'>{location.pathname}</output>;
}

function InnerNavigation(): ReactElement {
  const navigate = useNavigate();
  return (
    <button
      type='button'
      onClick={() => navigate('/settings/ai/knowledge-base/demo')}
    >
      Open
    </button>
  );
}

test('hosts knowledge base navigation without changing the application router', () => {
  render(
    <MemoryRouter initialEntries={['/settings/ai']}>
      <Routes>
        <Route
          path='/settings/ai'
          element={
            <>
              <OuterLocation />
              <KnowledgeBaseSettingsPage />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByTestId('outer-path').textContent).toBe('/settings/ai');
  expect(screen.getByText('Knowledge base directory')).toBeDefined();
});

test('isolates internal navigation from the application router', () => {
  render(
    <MemoryRouter initialEntries={['/settings/ai']}>
      <OuterLocation />
      <UNSAFE_LocationContext.Provider value={null!}>
        <MemoryRouter initialEntries={['/settings/ai']}>
          <Routes>
            <Route path='/settings/ai' element={<InnerNavigation />} />
            <Route
              path='/settings/ai/knowledge-base/:knowledgeBaseKey'
              element={<p>Workspace</p>}
            />
          </Routes>
        </MemoryRouter>
      </UNSAFE_LocationContext.Provider>
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  expect(screen.getByText('Workspace')).toBeDefined();
  expect(
    screen
      .getAllByTestId('outer-path')
      .every((node) => node.textContent === '/settings/ai'),
  ).toBe(true);
});
