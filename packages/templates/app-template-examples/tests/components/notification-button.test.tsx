import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  count: 120,
  session: { user: { id: 'user-1' } } as { user: { id: string } } | null,
  allowed: true,
  cleanup: vi.fn(),
  request: vi.fn(),
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ session: mocks.session, isPending: false }),
}));
vi.mock('@refinedev/core', () => ({
  useCan: () => ({ data: { can: mocks.allowed } }),
}));
vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  const client = { request: mocks.request };
  const realtime = {
    subscribe: () => mocks.cleanup,
    onOpen: () => mocks.cleanup,
  };
  return {
    ...actual,
    useService: (token: unknown) =>
      token === actual.realtimeClientToken ? realtime : client,
  };
});
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (_key: string, values?: { count: number }) =>
      values ? `Notifications, ${values.count} unread` : 'Notifications',
  }),
}));
import { NotificationButton } from '../../client/components/notification-button.tsx';

it('caps the badge, follows the app base, refreshes unread state, and resets on account changes', async () => {
  mocks.request.mockImplementation(async () => ({ count: mocks.count }));
  const renderButton = () => (
    <MemoryRouter basename='/demo' initialEntries={['/demo/']}>
      <NotificationButton />
    </MemoryRouter>
  );
  const view = render(renderButton());
  const link = await screen.findByRole('link', {
    name: 'Notifications, 120 unread',
  });
  expect(link).toHaveAttribute('href', '/demo/notifications');
  expect(screen.getByText('99+')).toBeInTheDocument();
  mocks.count = 2;
  fireEvent(window, new Event('focus'));
  await screen.findByRole('link', { name: 'Notifications, 2 unread' });
  mocks.count = 0;
  mocks.session = { user: { id: 'user-2' } };
  view.rerender(renderButton());
  await screen.findByRole('link', { name: 'Notifications' });
  expect(screen.queryByText('2')).not.toBeInTheDocument();
  await waitFor(() => expect(mocks.cleanup).toHaveBeenCalledTimes(2));
  mocks.allowed = false;
  view.rerender(renderButton());
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  mocks.allowed = true;
  mocks.session = null;
  view.rerender(renderButton());
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
