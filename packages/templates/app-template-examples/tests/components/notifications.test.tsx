import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  subscribe: vi.fn(),
  onOpen: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  const client = { request: mocks.request };
  const realtime = { subscribe: mocks.subscribe, onOpen: mocks.onOpen };
  return {
    ...actual,
    useApiClient: () => client,
    useService: (token: unknown) =>
      token === actual.realtimeClientToken ? realtime : client,
  };
});
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

import NotificationsPage from '../../client/pages/notifications.tsx';

it('loads the current inbox, persists read state with CSRF, filters unread, and cleans up subscriptions', async () => {
  let readAt: string | undefined;
  mocks.subscribe.mockReturnValue(mocks.cleanup);
  mocks.onOpen.mockReturnValue(mocks.cleanup);
  mocks.request.mockImplementation(
    async ({
      path,
      method,
      json,
    }: {
      path: string;
      method?: string;
      json?: { action?: string };
    }) => {
      if (path.endsWith('/csrf')) return { token: 'test-csrf' };
      if (path.endsWith('/unread-count')) return { count: readAt ? 0 : 1 };
      if (method === 'POST') {
        if (json?.action === 'read') readAt = new Date().toISOString();
        return { data: { id: 'message-1', readAt } };
      }
      return {
        data:
          path.includes('unreadOnly=true') && readAt
            ? []
            : [
                {
                  id: 'message-1',
                  title: 'Your report is ready',
                  body: 'Open your report.',
                  createdAt: '2026-09-17T12:00:00Z',
                  readAt,
                },
              ],
      };
    },
  );
  const view = render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
  expect(await screen.findByText('Your report is ready')).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Mark read', exact: true }),
  );
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'notifications/in-app/message-1',
        method: 'POST',
        headers: { 'x-csrf-token': 'test-csrf' },
        json: { action: 'read' },
      }),
    ),
  );
  await screen.findByRole('button', { name: 'Mark unread' });
  fireEvent.click(screen.getByRole('button', { name: 'Unread', exact: true }));
  expect(await screen.findByText('You’re all caught up')).toBeInTheDocument();
  expect(screen.queryByText('No more messages')).not.toBeInTheDocument();
  view.unmount();
  expect(mocks.cleanup).toHaveBeenCalledTimes(2);
});

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  // Unmount while browser API stubs are still installed: pending React effects
  // can run during cleanup, before the shared preset's cleanup hook is reached.
  cleanup();
  vi.unstubAllGlobals();
});

it('automatically loads the last page once when the bottom becomes visible', async () => {
  let intersect: IntersectionObserverCallback | undefined;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  mocks.request.mockReset();
  mocks.request.mockImplementation(async ({ path }: { path: string }) => {
    if (path.endsWith('/unread-count')) return { count: 0 };
    const lastPage = path.includes('cursor=next');
    return {
      data: [
        {
          id: lastPage ? 'second' : 'first',
          title: lastPage ? 'Older message' : 'Latest message',
          body: 'Test',
          createdAt: '2026-09-17T12:00:00Z',
        },
      ],
      nextCursor: lastPage ? undefined : 'next',
    };
  });
  render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
  await screen.findByText('Latest message');
  expect(screen.queryByText('Older message')).not.toBeInTheDocument();
  expect(screen.queryByText('No more messages')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Load more' }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(intersect).toBeDefined());
  act(() => {
    intersect?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    intersect?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
  await screen.findByText('Older message');
  expect(
    mocks.request.mock.calls.filter(([request]) =>
      request.path.includes('cursor=next'),
    ),
  ).toHaveLength(1);
  expect(screen.getByText('Latest message')).toBeInTheDocument();
  expect(screen.getByText('No more messages')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Load more' }),
  ).not.toBeInTheDocument();
});

it('expands and collapses overflowing message bodies independently', async () => {
  const measurements: (() => void)[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: () => void) {}
      observe(element: HTMLElement) {
        Object.defineProperty(element, 'scrollHeight', {
          configurable: true,
          value: element.textContent === 'Long message body' ? 120 : 24,
        });
        element.style.lineHeight = '24px';
        measurements.push(this.callback);
      }
      disconnect() {}
    },
  );
  mocks.request.mockReset();
  mocks.request.mockImplementation(async ({ path }: { path: string }) => {
    if (path.endsWith('/unread-count')) return { count: 0 };
    return {
      data: ['Long message body', 'Short message'].map((body) => ({
        id: body,
        title: body === 'Short message' ? 'Short' : 'Long',
        body,
        createdAt: '2026-09-17T12:00:00Z',
      })),
    };
  });
  render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
  await screen.findByText('Long message body');
  act(() => measurements.forEach((measure) => measure()));
  const expand = screen.getByRole('button', { name: 'Show more' });
  expect(expand).toHaveAttribute('aria-expanded', 'false');
  expect(expand).toHaveAttribute(
    'aria-controls',
    screen.getByText('Long message body').id,
  );
  fireEvent.click(expand);
  const collapse = screen.getByRole('button', { name: 'Show less' });
  expect(collapse).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('Long message body')).not.toHaveClass('line-clamp-3');
  fireEvent.click(collapse);
  expect(screen.getByText('Long message body')).toHaveClass('line-clamp-3');
  expect(screen.getAllByRole('button', { name: 'Show more' })).toHaveLength(1);
});
