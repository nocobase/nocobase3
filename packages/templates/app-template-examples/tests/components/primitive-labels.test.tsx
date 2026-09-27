import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Keys stand in for the wording, so the assertions show which key names each label.
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { createToastManager, Toaster } from '@/components/ui/toast';

// These shipped primitives replace the English the registry builds into them with translation keys. Updating one
// by overwriting it with the registry's file brings the English back, and the matching test fails.
describe('labels built into the shipped primitives', () => {
  it('names the Dialog close button through actions.close', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Panel</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(
      screen.getByRole('button', { name: 'actions.close' }),
    ).toBeInTheDocument();
  });

  it('names the toast close button through actions.close', async () => {
    const manager = createToastManager();
    render(<Toaster toastManager={manager} />);

    act(() => {
      manager.add({ title: 'Saved' });
    });

    // Base UI keeps the close button aria-hidden until the toast list is expanded, so find it by its label.
    const [close] = await screen.findAllByLabelText('actions.close');
    expect(close).toHaveAttribute('data-slot', 'toast-close');
  });

  it('labels the Spinner through status.loading', () => {
    render(<Spinner />);

    expect(
      screen.getByRole('status', { name: 'status.loading' }),
    ).toBeInTheDocument();
  });
});
