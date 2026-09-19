beforeEach(() =>
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
);
afterEach(() => vi.unstubAllGlobals());
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  routeKey,
  type RouteNavigationItem,
} from '../../client/routing/route-navigation.js';
import { SidebarProvider } from '../../client/components/ui/sidebar';
import { NavigationTree } from '../../client/layouts/components/navigation-tree.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function page(name: string): AppClientRegisteredRoute {
  return {
    name,
    id: name,
    path: `/${name}`,
    auth: 'required',
    packageName: 'test',
    source: 'application',
    navigation: { title: name },
    componentLoader: async () => ({ default: () => null }),
  };
}

const child = page('child');
const sibling = page('sibling');

describe.each([
  { title: 'navigation group', clickable: false },
  { title: 'clickable parent', clickable: true },
])('$title', ({ clickable }) => {
  const item: RouteNavigationItem = {
    route: {
      ...page('Group'),
      componentLoader: clickable ? page('Group').componentLoader : undefined,
    },
    children: [
      { route: child, children: [] },
      { route: sibling, children: [] },
    ],
  };
  function tree(selectedKey: string | undefined) {
    return (
      <MemoryRouter>
        <SidebarProvider>
          <NavigationTree
            item={item}
            selectedKey={selectedKey}
            onNavigate={() => {}}
          />
        </SidebarProvider>
      </MemoryRouter>
    );
  }
  function toggle() {
    return screen.getByRole('button', { name: 'Group' });
  }
  function expectExpanded(expanded: boolean) {
    expect(toggle()).toHaveAttribute('aria-expanded', String(expanded));
  }

  it('keeps an active group open when navigating to another group', () => {
    const { rerender } = render(tree(routeKey(child)));
    expectExpanded(true);
    rerender(tree('elsewhere'));
    expectExpanded(true);
  });

  it('preserves a manually expanded group across navigation', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree('elsewhere'));
    await user.click(toggle());
    expectExpanded(true);
    rerender(tree('another-page'));
    expectExpanded(true);
    rerender(tree(routeKey(child)));
    rerender(tree('elsewhere'));
    expectExpanded(true);
  });

  it('preserves manual collapse until navigating into the group', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree(routeKey(child)));
    await user.click(toggle());
    expectExpanded(false);
    rerender(tree(routeKey(child)));
    expectExpanded(false);
    rerender(tree('elsewhere'));
    expectExpanded(false);
    rerender(tree(routeKey(sibling)));
    expectExpanded(true);
  });
});

describe('collapsed navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  function show(item: RouteNavigationItem, collapsed = true) {
    const onNavigate = vi.fn();
    render(
      <MemoryRouter>
        <SidebarProvider open={!collapsed}>
          <NavigationTree
            item={item}
            selectedKey={routeKey(child)}
            onNavigate={onNavigate}
          />
        </SidebarProvider>
      </MemoryRouter>,
    );
    return onNavigate;
  }

  it('shows a leaf label on hover and dismisses it on leave', async () => {
    const user = userEvent.setup();
    show({ route: page('Home'), children: [] });
    const link = screen.getByRole('link', { name: 'Home' });
    await user.hover(link);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Home');
    expect(link).not.toHaveAttribute('title');
    await user.unhover(link);
    await waitFor(() =>
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
    );
  });

  it.each([false, true])(
    'opens a group list on hover (clickable parent: %s)',
    async (clickable) => {
      const user = userEvent.setup();
      const onNavigate = show({
        route: {
          ...page('Group'),
          componentLoader: clickable
            ? page('Group').componentLoader
            : undefined,
        },
        children: [{ route: child, children: [] }],
      });
      await user.hover(
        screen.getByRole(clickable ? 'link' : 'button', { name: 'Group' }),
      );
      const popup = await screen.findByRole('dialog', { name: 'Group' });
      const link = within(popup).getByRole('link', { name: 'child' });
      expect(link).toHaveAttribute('aria-current', 'page');
      expect(link).toHaveAttribute('href', '/child');
      await user.hover(popup);
      await user.click(link);
      expect(onNavigate).toHaveBeenCalledOnce();
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
    },
  );

  it('opens on keyboard focus and closes with Escape', async () => {
    const user = userEvent.setup();
    show({
      route: { ...page('Group'), componentLoader: undefined },
      children: [{ route: child, children: [] }],
    });
    await user.tab();
    expect(await screen.findByRole('dialog', { name: 'Group' })).toBeVisible();
    await user.tab();
    expect(screen.getByRole('link', { name: 'child' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('keeps a parent link navigable and expands nested groups inside the popup', async () => {
    const user = userEvent.setup();
    const onNavigate = show({
      route: page('Parent'),
      children: [
        {
          route: { ...page('Nested'), componentLoader: undefined },
          children: [{ route: sibling, children: [] }],
        },
      ],
    });
    const parent = screen.getByRole('link', { name: 'Parent' });
    expect(parent).toHaveAttribute('href', '/Parent');
    await user.hover(parent);
    const popup = await screen.findByRole('dialog', { name: 'Parent' });
    await user.click(within(popup).getByText('Nested'));
    expect(within(popup).getByRole('link', { name: 'sibling' })).toBeVisible();
    await user.click(parent);
    expect(onNavigate).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('does not reopen an old popup after expanding and collapsing the sidebar', async () => {
    const user = userEvent.setup();
    const item = {
      route: { ...page('Group'), componentLoader: undefined },
      children: [{ route: child, children: [] }],
    };
    const tree = (collapsed: boolean) => (
      <MemoryRouter>
        <SidebarProvider open={!collapsed}>
          <NavigationTree
            item={item}
            selectedKey={undefined}
            onNavigate={() => {}}
          />
        </SidebarProvider>
      </MemoryRouter>
    );
    const { rerender } = render(tree(true));
    await user.hover(screen.getByRole('button', { name: 'Group' }));
    expect(await screen.findByRole('dialog')).toBeVisible();
    rerender(tree(false));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(tree(true));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['expanded', 'mobile'])(
    'does not add hover overlays when %s',
    async (mode) => {
      if (mode === 'mobile') vi.stubGlobal('innerWidth', 390);
      if (mode === 'mobile')
        vi.stubGlobal('matchMedia', () => ({
          matches: false,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }));
      const user = userEvent.setup();
      show({ route: page('Home'), children: [] }, mode !== 'expanded');
      await user.hover(screen.getByRole('link', { name: 'Home' }));
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );
});
