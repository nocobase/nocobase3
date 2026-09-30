import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Return the key so the test proves both overlays ask for the same translation.
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '../../client/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '../../client/components/ui/sheet';

describe('overlay close buttons', () => {
  it('translates the Sheet close button like the Dialog one', async () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Panel</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(
      await screen.findByRole('button', { name: 'actions.close' }),
    ).toBeInTheDocument();
  });

  it('keeps the Dialog close button translated', async () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(
      await screen.findByRole('button', { name: 'actions.close' }),
    ).toBeInTheDocument();
  });
});
