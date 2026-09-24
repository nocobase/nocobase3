// @vitest-environment jsdom
import {
  defineSettingsRoutes,
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import {
  createMemoryRouter,
  Link,
  Outlet,
  RouterProvider,
  useMatches,
  type RouteObject,
} from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
  createAISettings,
  registerAISettingsTabs,
} from '../client/ai-settings.js';
import { withAISettingsShell } from '../client/ai-settings-shell.js';
import settings from '../client/settings.js';

vi.mock('../client/locales/index.js', () => ({
  useT: () => (key: string) => (key === 'tools.title' ? 'Tools' : key),
}));
vi.mock('../client/pages/tools-settings-page.js', () => ({
  default: () => <div>Tools content</div>,
}));
vi.mock('../client/pages/skills-settings-page.js', () => ({
  default: () => <div>Skills content</div>,
}));
vi.mock('../client/pages/ai-employee-page.js', () => ({
  default: () => <div>Employee content</div>,
}));
vi.mock('../client/pages/llm-service-page.js', () => ({
  default: () => <div>LLM content</div>,
}));
vi.mock('../client/pages/mcp-page.js', () => ({
  default: () => <div>MCP content</div>,
}));
vi.mock('../client/pages/conversation-center-page.js', () => ({
  default: () => <div>Conversation content</div>,
}));

registerAISettingsTabs([
  {
    key: 'knowledge-base',
    labelKey: 'Knowledge Base',
    pageLoader: async () => ({ default: () => <div>Knowledge content</div> }),
  },
  {
    key: 'vector-database',
    labelKey: 'Vector Database',
    pageLoader: async () => ({ default: () => <div>Vector content</div> }),
  },
]);

const { settingsRouteTree } = resolveAppClientContributions([
  { packageName: '@nocobase/app-plugin-ai-employee', routes: settings },
]);

function SettingsNavigation({
  nodes,
}: {
  nodes: readonly AppClientRegisteredRoute[];
}) {
  const matches = useMatches();
  return nodes.map((node) => (
    <div key={node.id}>
      {node.navigation ? (
        node.componentLoader ? (
          <Link
            to={node.path}
            aria-current={
              matches.some((match) => match.id === node.id) ? 'page' : undefined
            }
          >
            {node.navigation.title === 'tools.title'
              ? 'Tools'
              : node.navigation.title}
          </Link>
        ) : (
          <span>{node.navigation.title}</span>
        )
      ) : null}
      {node.children ? <SettingsNavigation nodes={node.children} /> : null}
    </div>
  ));
}

function toRouterRoutes(
  nodes: readonly AppClientRegisteredRoute[],
): RouteObject[] {
  return nodes.map((node) => ({
    id: node.id,
    path: node.path,
    ...(node.componentLoader
      ? {
          lazy: async () => ({
            Component: (await node.componentLoader!()).default,
          }),
        }
      : { element: <Outlet /> }),
    children: node.children ? toRouterRoutes(node.children) : undefined,
  }));
}

function createRouter(
  initialEntries: (
    | string
    | { pathname: string; search?: string; hash?: string; state: unknown }
  )[],
  basename?: string,
  tree: readonly AppClientRegisteredRoute[] = settingsRouteTree,
) {
  return createMemoryRouter(
    [
      {
        element: (
          <>
            <nav aria-label='Settings menu'>
              <SettingsNavigation nodes={tree} />
            </nav>
            <Outlet />
          </>
        ),
        children: toRouterRoutes(tree),
      },
    ],
    { initialEntries, basename },
  );
}

function expectCenterWithoutEmployeeShell() {
  expect(screen.getByText('Conversation content')).toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'AI Employees' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('navigation', { name: 'AI settings' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'LLM services' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Employee content')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Conversations' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'AI Employees' }),
  ).not.toHaveAttribute('aria-current');
}

function openMenuPage(title: string) {
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Settings menu' })).getByRole(
      'link',
      { name: title },
    ),
  );
}

async function travel(router: ReturnType<typeof createRouter>, delta: number) {
  await act(async () => {
    await router.navigate(delta);
  });
}

describe('AI settings page navigation', () => {
  it.each(['/settings/ai/tools', '/settings/ai/tools/'])(
    'opens Tools independently at %s and restores sibling navigation',
    async (path) => {
      const router = createRouter([`/main${path}`], '/main');
      render(<RouterProvider router={router} />);
      expect(await screen.findByText('Tools content')).toBeInTheDocument();
      expect(screen.queryByText('Employee content')).not.toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Tools' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      openMenuPage('Skills');
      expect(await screen.findByText('Skills content')).toBeInTheDocument();
      await travel(router, -1);
      expect(await screen.findByText('Tools content')).toBeInTheDocument();
      await travel(router, 1);
      expect(await screen.findByText('Skills content')).toBeInTheDocument();
      openMenuPage('Tools');
      expect(await screen.findByText('Tools content')).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/main/settings/ai/tools');
    },
  );
  it.each(['/settings/ai/skills', '/settings/ai/skills/'])(
    'opens Skills independently at %s',
    async (path) => {
      const router = createRouter([`/main${path}`], '/main');
      render(<RouterProvider router={router} />);
      expect(await screen.findByText('Skills content')).toBeInTheDocument();
      expect(screen.queryByText('Employee content')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Skills' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(
        screen.getByRole('link', { name: 'AI Employees' }),
      ).not.toHaveAttribute('aria-current');
      openMenuPage('AI Employees');
      expect(await screen.findByText('Employee content')).toBeInTheDocument();
      await travel(router, -1);
      expect(await screen.findByText('Skills content')).toBeInTheDocument();
      await travel(router, 1);
      expect(await screen.findByText('Employee content')).toBeInTheDocument();
      openMenuPage('Skills');
      expect(await screen.findByText('Skills content')).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/main/settings/ai/skills');
    },
  );
  function expectServiceNavigation(activeLabel: string) {
    expect(
      screen.getByRole('heading', { name: activeLabel }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'AI Settings' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'AI Settings' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'AI settings' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /LLM services|MCP services|MCP servers/,
      }),
    ).not.toBeInTheDocument();
    const menu = within(
      screen.getByRole('navigation', { name: 'Settings menu' }),
    );
    expect(menu.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'AI Employees',
      'Skills',
      'Tools',
      'LLM services',
      'MCP services',
    ]);
    expect(menu.getByRole('link', { name: activeLabel })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      menu.queryByRole('link', { name: 'AI Settings' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Employee content')).not.toBeInTheDocument();
  }

  it.each([
    ['/settings/ai/llm-services', 'LLM content', 'LLM services'],
    ['/settings/ai/llm-services/?tab=mcp', 'LLM content', 'LLM services'],
    ['/settings/ai/mcp-services', 'MCP content', 'MCP services'],
    [
      '/settings/ai/mcp-services/?tab=llm-service',
      'MCP content',
      'MCP services',
    ],
  ])(
    'loads a standalone service page directly at %s',
    async (path, content, label) => {
      const router = createRouter([path]);
      render(<RouterProvider router={router} />);
      expect(await screen.findByText(content)).toBeInTheDocument();
      expectServiceNavigation(label);
      expect(router.state.historyAction).toBe('POP');
    },
  );

  it('restores independent service pages with back/forward under a basename', async () => {
    const router = createRouter(
      ['/main/settings/ai/llm-services?filter=recent&tag=a&tag=b#section'],
      '/main',
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByText('LLM content')).toBeInTheDocument();
    expectServiceNavigation('LLM services');
    openMenuPage('MCP services');
    expect(await screen.findByText('MCP content')).toBeInTheDocument();
    expectServiceNavigation('MCP services');
    expect(router.state.location.pathname).toBe(
      '/main/settings/ai/mcp-services',
    );
    await travel(router, -1);
    expect(await screen.findByText('LLM content')).toBeInTheDocument();
    expectServiceNavigation('LLM services');
    expect(router.state.location.search).toBe('?filter=recent&tag=a&tag=b');
    expect(router.state.location.hash).toBe('#section');
    await travel(router, 1);
    expect(await screen.findByText('MCP content')).toBeInTheDocument();
    expectServiceNavigation('MCP services');
  });

  it.each([
    ['/main/settings/ai/', 'llm-service'],
    ['/main/settings/ai/', 'mcp'],
    ['/main/settings/ai/settings/', 'llm-service'],
    ['/main/settings/ai/settings/', 'mcp'],
  ])(
    'redirects legacy %s %s query and state links with replace',
    async (pathname, tab) => {
      for (const entry of [
        `${pathname}?tab=${tab}&filter=recent&tag=a&tag=b#section`,
        {
          pathname,
          search: '?filter=recent&tag=a&tag=b',
          hash: '#section',
          state: { aiSettingsTab: tab },
        },
      ]) {
        const router = createRouter(
          ['/main/settings/ai/conversations', entry],
          '/main',
        );
        const view = render(<RouterProvider router={router} />);
        expect(
          await screen.findByText(
            tab === 'mcp' ? 'MCP content' : 'LLM content',
          ),
        ).toBeInTheDocument();
        expectServiceNavigation(
          tab === 'mcp' ? 'MCP services' : 'LLM services',
        );
        expect(router.state.location.pathname).toBe(
          `/main/settings/ai/${tab === 'mcp' ? 'mcp' : 'llm'}-services`,
        );
        expect(router.state.historyAction).toBe('REPLACE');
        const search = new URLSearchParams(router.state.location.search);
        expect(search.has('tab')).toBe(false);
        expect(search.get('filter')).toBe('recent');
        expect(search.getAll('tag')).toEqual(['a', 'b']);
        expect(router.state.location.hash).toBe('#section');
        await travel(router, -1);
        expect(
          await screen.findByText('Conversation content'),
        ).toBeInTheDocument();
        expect(router.state.location.pathname).toBe(
          '/main/settings/ai/conversations',
        );
        await travel(router, 1);
        expect(
          await screen.findByText(
            tab === 'mcp' ? 'MCP content' : 'LLM content',
          ),
        ).toBeInTheDocument();
        expectServiceNavigation(
          tab === 'mcp' ? 'MCP services' : 'LLM services',
        );
        view.unmount();
        router.dispose();
      }
    },
  );

  it.each([
    ['', undefined],
    ['?tab=unknown', { aiSettingsTab: 'mcp' }],
    ['?tab=llm-service', { aiSettingsTab: 'mcp' }],
    ['?tab=', { aiSettingsTab: 'mcp' }],
    ['', { aiSettingsTab: 42 }],
    ['', 'mcp'],
  ])(
    'defaults old service URLs to LLM with query precedence: %s %j',
    async (search, state) => {
      const router = createRouter([
        { pathname: '/settings/ai/settings', search, state },
      ]);
      render(<RouterProvider router={router} />);
      expect(await screen.findByText('LLM content')).toBeInTheDocument();
      expectServiceNavigation('LLM services');
      expect(router.state.location.pathname).toBe('/settings/ai/llm-services');
      expect(router.state.location.search).toBe('');
      expect(router.state.historyAction).toBe('REPLACE');
    },
  );

  it.each(['LLM', 'MCP'] as const)(
    'exports an actual standalone %s page, independent of legacy tab state',
    async (service) => {
      const { LLMServiceSettingsPage, MCPServiceSettingsPage } =
        await import('../client/settings-pages.js');
      const router = createMemoryRouter(
        [
          {
            path: '*',
            Component:
              service === 'LLM'
                ? LLMServiceSettingsPage
                : MCPServiceSettingsPage,
          },
        ],
        { initialEntries: ['/settings/ai/settings?tab=mcp'] },
      );
      render(<RouterProvider router={router} />);
      expect(await screen.findByText(`${service} content`)).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: `${service} services` }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
  );
  it.each(['/settings/ai/conversations', '/settings/ai/conversations/'])(
    'renders the center directly without the employee shell at %s',
    async (path) => {
      render(<RouterProvider router={createRouter([path])} />);
      expect(
        await screen.findByText('Conversation content'),
      ).toBeInTheDocument();
      expectCenterWithoutEmployeeShell();
      expect(
        within(
          screen.getByRole('navigation', { name: 'Settings menu' }),
        ).getByText('AI'),
      ).toBeInTheDocument();
    },
  );

  it('supports a deployment basename on direct links and sibling navigation', async () => {
    const router = createRouter(['/main/settings/ai/conversations'], '/main');
    render(<RouterProvider router={router} />);
    expect(await screen.findByText('Conversation content')).toBeInTheDocument();
    expectCenterWithoutEmployeeShell();
    openMenuPage('AI Employees');
    expect(await screen.findByText('Employee content')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'LLM services' }),
    ).not.toBeInTheDocument();
    openMenuPage('LLM services');
    expect(await screen.findByText('LLM content')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      '/main/settings/ai/llm-services',
    );
    openMenuPage('MCP services');
    expect(await screen.findByText('MCP content')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      '/main/settings/ai/mcp-services',
    );
    await act(() => router.navigate('/settings/ai/conversations'));
    expect(await screen.findByText('Conversation content')).toBeInTheDocument();
    expectCenterWithoutEmployeeShell();
    expect(router.state.location.pathname).toBe(
      '/main/settings/ai/conversations',
    );
  });

  it.each(['/settings/ai', '/settings/ai/', '/settings/ai?tab=ai-employee'])(
    'renders only employee content at %s even when legacy tabs are registered',
    async (path) => {
      const router = createRouter([path]);
      render(<RouterProvider router={router} />);
      expect(await screen.findByText('Employee content')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'AI Employees' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('navigation', { name: 'AI settings' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: /Knowledge Base|Vector Database|AI Employee/,
        }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      await act(() => router.navigate('/settings/ai/conversations'));
      expect(
        await screen.findByText('Conversation content'),
      ).toBeInTheDocument();
      await travel(router, -1);
      expect(await screen.findByText('Employee content')).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(
        '/settings/ai' + (path.endsWith('/') ? '/' : ''),
      );
    },
  );

  it.each(['knowledge-base', 'vector-database'])(
    'redirects legacy query and state links to standalone %s with replace',
    async (tab) => {
      const { settingsRouteTree: tree } = resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-ai-employee',
          routes: defineSettingsRoutes([
            createAISettings(),
            {
              parent: 'aiGroup',
              name: tab,
              path: `/ai/${tab}`,
              componentLoader: async () => ({
                default: () => <div>Standalone content</div>,
              }),
            },
          ]),
        },
      ]);
      for (const entry of [
        `/main/settings/ai/?tab=${tab}&tag=a&tag=b#section`,
        {
          pathname: '/main/settings/ai/',
          search: '?tag=a&tag=b',
          hash: '#section',
          state: { aiSettingsTab: tab },
        },
      ]) {
        const router = createRouter(
          ['/main/settings/ai/conversations', entry],
          '/main',
          tree,
        );
        const view = render(<RouterProvider router={router} />);
        expect(
          await screen.findByText('Standalone content'),
        ).toBeInTheDocument();
        expect(router.state.location.pathname).toBe(`/main/settings/ai/${tab}`);
        expect(router.state.location.search).toBe('?tag=a&tag=b');
        expect(router.state.location.hash).toBe('#section');
        expect(router.state.historyAction).toBe('REPLACE');
        expect(screen.queryByText('Employee content')).not.toBeInTheDocument();
        await travel(router, -1);
        expect(
          await screen.findByText('Conversation content'),
        ).toBeInTheDocument();
        await travel(router, 1);
        expect(
          await screen.findByText('Standalone content'),
        ).toBeInTheDocument();
        view.unmount();
        router.dispose();
      }
    },
  );

  it.each([
    '/settings/ai/?tab=conversations&filter=recent&tag=one&tag=two',
    {
      pathname: '/settings/ai/',
      search: '?filter=recent&tag=one&tag=two',
      state: { aiSettingsTab: 'conversations' },
    },
  ])(
    'canonicalizes a legacy center link with query preservation and replace: %j',
    async (entry) => {
      const router = createRouter(['/settings/ai?tab=mcp', entry]);
      render(<RouterProvider router={router} />);
      expect(
        await screen.findByText('Conversation content'),
      ).toBeInTheDocument();
      expectCenterWithoutEmployeeShell();
      expect(router.state.location.pathname).toBe('/settings/ai/conversations');
      expect(router.state.location.search).toBe(
        '?filter=recent&tag=one&tag=two',
      );
      await travel(router, -1);
      expect(await screen.findByText('MCP content')).toBeInTheDocument();
      await travel(router, 1);
      expect(
        await screen.findByText('Conversation content'),
      ).toBeInTheDocument();
      expectCenterWithoutEmployeeShell();
    },
  );

  it('keeps explicit employee tab queries ahead of legacy center state', async () => {
    render(
      <RouterProvider
        router={createRouter([
          {
            pathname: '/settings/ai',
            search: '?tab=mcp',
            state: { aiSettingsTab: 'conversations' },
          },
        ])}
      />,
    );
    expect(await screen.findByText('MCP content')).toBeInTheDocument();
    expect(screen.queryByText('Conversation content')).not.toBeInTheDocument();
  });

  it.each(['knowledge-base', 'vector-database'])(
    'keeps the public shell wrapper tab-free on a %s detail URL',
    async (tab) => {
      const { settingsRouteTree: tree } = resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-ai-employee',
          routes: defineSettingsRoutes([
            createAISettings(),
            {
              name: `${tab}-detail`,
              path: `/ai/${tab}/:id`,
              componentLoader: async () => ({
                default: withAISettingsShell(() => <div>Detail content</div>),
              }),
            },
          ]),
        },
      ]);
      const router = createRouter(
        [`/settings/ai/${tab}/42?tab=conversations`],
        undefined,
        tree,
      );
      render(<RouterProvider router={router} />);
      expect(await screen.findByText('Detail content')).toBeInTheDocument();
      expect(
        screen.queryByRole('navigation', { name: 'AI settings' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      openMenuPage('AI Employees');
      expect(await screen.findByText('Employee content')).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/settings/ai');
      expect(router.state.location.search).toBe('');
      await travel(router, -1);
      expect(await screen.findByText('Detail content')).toBeInTheDocument();
    },
  );

  it('falls back safely for an unknown legacy tab', async () => {
    render(
      <RouterProvider router={createRouter(['/settings/ai?tab=missing'])} />,
    );
    expect(await screen.findByText('Employee content')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'AI Employees' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'AI settings' }),
    ).not.toBeInTheDocument();
  });
});
