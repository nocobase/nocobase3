import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  routeKey,
  type RouteNavigationItem,
} from '../../client/routing/route-navigation.js';
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
        <NavigationTree
          item={item}
          collapsed={false}
          selectedKey={selectedKey}
          onNavigate={() => {}}
        />
      </MemoryRouter>
    );
  }
  function toggle() {
    return clickable
      ? screen.getByRole('button', { name: 'Group' })
      : screen
          .getByText('Group', { selector: 'summary span.truncate' })
          .closest('summary')!;
  }
  function expectExpanded(expanded: boolean) {
    if (clickable)
      expect(toggle()).toHaveAttribute('aria-expanded', String(expanded));
    else expect(toggle().closest('details')!.open).toBe(expanded);
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
