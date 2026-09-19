import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '../../client/components/ui/sidebar';

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => vi.unstubAllGlobals());

function shell() {
  return (
    <SidebarProvider>
      <Sidebar collapsible='icon'>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip='Home'>Home</SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <SidebarTrigger aria-label='Toggle navigation' />
    </SidebarProvider>
  );
}
it('uses the provider for trigger and keyboard collapse with automatic label hints', async () => {
  const user = userEvent.setup();
  render(shell());
  const menu = screen.getByRole('button', { name: 'Home' });
  await user.hover(menu);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Toggle navigation' }));
  expect(document.cookie).toContain('sidebar_state=false');
  await user.hover(menu);
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Home');
  await user.keyboard('{Control>}b{/Control}');
  await waitFor(() =>
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
  );
  expect(document.cookie).toContain('sidebar_state=true');
});
it('uses the mobile sheet and dismisses it with Escape', async () => {
  vi.stubGlobal('innerWidth', 390);
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const user = userEvent.setup();
  render(shell());
  await user.click(screen.getByRole('button', { name: 'Toggle navigation' }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toBeVisible();
  await user.click(within(dialog).getByRole('button', { name: 'Home' }));
  await user.keyboard('{Escape}');
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
});
