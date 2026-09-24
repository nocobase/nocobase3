// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  canReset: true,
  request: vi.fn(async () => ({ data: {} })),
}));
vi.mock('@nocobase/app-client', () => ({
  apiClientToken: {},
  useService: () => fixture,
}));
vi.mock('../client/pages/use-example.js', () => ({
  useExample: () => ({
    data: { canReset: fixture.canReset, roles: [] },
    reload: vi.fn(),
  }),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
import OverviewPage from '../client/pages/overview-page.js';
beforeEach(() => {
  fixture.canReset = true;
  fixture.request.mockClear();
});
it('requires confirmation before resetting the shared practice records', async () => {
  render(<OverviewPage />);
  fireEvent.click(screen.getByRole('button', { name: 'reset.action' }));
  expect(screen.getByText('reset.confirm')).toBeInTheDocument();
  expect(fixture.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'reset.cancel' }));
  expect(screen.queryByText('reset.confirm')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'reset.action' }));
  fireEvent.click(screen.getByRole('button', { name: 'reset.action' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('reset.done'),
  );
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith({
    method: 'POST',
    path: '/authorization-example/reset',
    json: {},
  });
});
it('hides reset controls from demo accounts', () => {
  fixture.canReset = false;
  render(<OverviewPage />);
  expect(
    screen.queryByRole('button', { name: 'reset.action' }),
  ).not.toBeInTheDocument();
});
