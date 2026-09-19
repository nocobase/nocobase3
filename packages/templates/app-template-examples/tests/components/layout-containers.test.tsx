import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LayoutHeader } from '../../client/layouts/components/layout-header.js';
import { LayoutSidebar } from '../../client/layouts/components/layout-sidebar.js';

function viewport(desktop: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: desktop,
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => media);
  return (value: boolean) => {
    media.matches = value;
    listeners.forEach((listener) => listener());
  };
}
afterEach(() => vi.unstubAllGlobals());
it('renders arbitrary header content and native attributes without providers', () => {
  render(
    <LayoutHeader aria-label='Tools' className='justify-end'>
      <input aria-label='Search' />
    </LayoutHeader>,
  );
  expect(screen.getByRole('banner', { name: 'Tools' })).toHaveClass(
    'justify-end',
  );
  expect(screen.getByRole('textbox', { name: 'Search' })).toBeVisible();
});
it('preserves child state through desktop collapse and hiding', () => {
  viewport(true);
  const props = {
    'aria-label': 'Tools',
    mobileOpen: false,
    onMobileOpenChange: vi.fn(),
  };
  const content = <input aria-label='Draft' defaultValue='' />;
  const { rerender } = render(
    <LayoutSidebar {...props} desktopState='expanded'>
      {content}
    </LayoutSidebar>,
  );
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'kept' } });
  rerender(
    <LayoutSidebar {...props} desktopState='collapsed'>
      {content}
    </LayoutSidebar>,
  );
  expect(screen.getByRole('textbox')).toHaveValue('kept');
  rerender(
    <LayoutSidebar {...props} desktopState='hidden'>
      {content}
    </LayoutSidebar>,
  );
  expect(screen.queryByRole('textbox')).toBeNull();
  rerender(
    <LayoutSidebar {...props} desktopState='expanded'>
      {content}
    </LayoutSidebar>,
  );
  expect(screen.getByRole('textbox')).toHaveValue('kept');
});
it('requests mobile close on Escape and desktop transition', async () => {
  const resize = viewport(false);
  const onMobileOpenChange = vi.fn();
  render(
    <LayoutSidebar
      aria-label='Tools'
      desktopState='expanded'
      mobileOpen
      onMobileOpenChange={onMobileOpenChange}
    >
      <button>Inside</button>
    </LayoutSidebar>,
  );
  expect(await screen.findByRole('dialog', { name: 'Tools' })).toBeVisible();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Inside' }), {
    key: 'Escape',
  });
  await waitFor(() => expect(onMobileOpenChange).toHaveBeenCalledWith(false));
  onMobileOpenChange.mockClear();
  act(() => resize(true));
  await waitFor(() => expect(onMobileOpenChange).toHaveBeenCalledWith(false));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('restores focus and retains arbitrary content across mobile close and reopen', async () => {
  viewport(false);
  const user = userEvent.setup();
  function Example() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open tools</button>
        <LayoutSidebar
          aria-label='Tools'
          desktopState='expanded'
          mobileOpen={open}
          onMobileOpenChange={setOpen}
        >
          <input aria-label='Draft' />
          <button onClick={() => setOpen(false)}>Close tools</button>
        </LayoutSidebar>
      </>
    );
  }
  render(<Example />);
  await user.click(screen.getByRole('button', { name: 'Open tools' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Draft' }),
    'Saved locally',
  );
  await user.click(screen.getByRole('button', { name: 'Close tools' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Open tools' })).toHaveFocus(),
  );
  expect(screen.queryByRole('textbox')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Open tools' }));
  expect(screen.getByRole('textbox')).toHaveValue('Saved locally');
});
