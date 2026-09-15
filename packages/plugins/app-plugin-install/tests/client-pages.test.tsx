/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@nocobase/app-client', () => ({
  resolveAppUrl: (value: string) => value,
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: {
        readonly defaultValue?: string;
      },
    ) => options?.defaultValue ?? key,
  }),
}));

import InstallPage from '../client/pages/install-page.js';

describe('installation page', () => {
  it('shows a restart-aware completion state after saving configuration', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ configured: true, restartRequired: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onConfigured = vi.fn();
    const onCheckStatus = vi.fn();

    render(
      <InstallPage onCheckStatus={onCheckStatus} onConfigured={onConfigured} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));

    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: 'Database configuration saved',
        }),
      ).toBeDefined(),
    );
    expect(
      screen.getByText(
        'Use your process manager or the NocoBase Hub Restart action, then return here. You do not need to submit the form again.',
      ),
    ).toBeDefined();
    expect(onConfigured).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onCheckStatus).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/install/configure',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
