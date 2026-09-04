import { render, screen } from '@testing-library/react';
import type { PropsWithChildren, ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../client/components/notification-in-app-provider.js', () => ({
  NotificationInAppProvider({ children }: PropsWithChildren): ReactElement {
    return <>{children}</>;
  },
}));

vi.mock('../client/components/notification-in-app-inbox.js', () => ({
  NotificationInAppInbox(): ReactElement {
    return <h1>Message center</h1>;
  },
}));

import NotificationInAppDevPage from '../client/dev/notification-in-app-page.js';

describe('in-app notification development page', () => {
  it('uses the standard surface page spacing', () => {
    render(<NotificationInAppDevPage />);

    const page = screen
      .getByRole('heading', { name: 'Message center' })
      .closest('section');
    expect(page).toHaveClass('px-6', 'py-10');
  });
});
