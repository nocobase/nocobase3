import type { RealtimeClient } from '@nocobase/app-client';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUnreadCount: vi.fn(),
  realtime: {
    connected: false,
    subscribe: vi.fn(),
    onOpen: vi.fn(),
    onError: vi.fn(),
    reconnect: vi.fn(),
    close: vi.fn(),
  } satisfies RealtimeClient,
  cleanup: vi.fn(),
  subscribe: vi.fn(),
  refresh: undefined as (() => void) | undefined,
}));

vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  return {
    ...actual,
    useService: (token: unknown) =>
      token === actual.realtimeClientToken ? mocks.realtime : undefined,
  };
});

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (_key: string, options: { count?: number } = {}) =>
      `${options.count ?? 0} unread messages`,
  }),
}));

vi.mock('../client/runtime.js', () => ({
  getMailClient: () => ({ getUnreadCount: mocks.getUnreadCount }),
}));

vi.mock('../client/subscription.js', () => ({
  subscribeToMailInvalidations: vi.fn(
    (_realtime: RealtimeClient, _target: Window, refresh: () => void) => {
      mocks.refresh = refresh;
      return mocks.cleanup;
    },
  ),
}));

import { MailNavigationIcon } from '../client/components/mail-navigation-icon.js';

describe('MailNavigationIcon', () => {
  it('renders the unread badge and refreshes its count from realtime invalidations', async () => {
    mocks.getUnreadCount.mockResolvedValueOnce(4).mockResolvedValueOnce(7);

    const view = render(<MailNavigationIcon />);

    expect(
      await screen.findByLabelText('4 unread messages'),
    ).toBeInTheDocument();
    mocks.refresh?.();
    await waitFor(() =>
      expect(screen.getByLabelText('7 unread messages')).toBeInTheDocument(),
    );

    view.unmount();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });
});
