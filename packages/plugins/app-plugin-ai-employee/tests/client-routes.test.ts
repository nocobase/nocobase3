import { describe, expect, it } from 'vitest';

import routes from '../client/routes.ts';

const expectedDemoRoutes = [
  ['ai-chat-window', '/chat', 'demo.navigation.chat'],
  ['ai-floating-chat', '/floating', 'demo.navigation.floating'],
  ['ai-employee-tasks', '/tasks', 'demo.navigation.tasks'],
  ['ai-page-context', '/context', 'demo.navigation.context'],
  ['ai-tool-cards', '/tools', 'demo.navigation.tools'],
] as const;

describe('AI Employee client routes', () => {
  it('contributes settings and one development-only AI Components group', async () => {
    const [settingsContribution, devContribution] = routes;

    expect(settingsContribution).toMatchObject({
      parent: 'settings',
      routes: [
        {
          name: 'aiGroup',
          navigation: { title: 'AI' },
          children: [
            { name: 'ai', path: '/ai' },
            { name: 'aiSkills', path: '/ai/skills' },
            { name: 'aiTools', path: '/ai/tools' },
            { name: 'aiConversations', path: '/ai/conversations' },
            { name: 'aiLLMServices', path: '/ai/llm-services' },
            { name: 'aiMCPServices', path: '/ai/mcp-services' },
            { name: 'aiSettings', path: '/ai/settings' },
          ],
        },
      ],
    });
    expect(devContribution).toMatchObject({
      parent: 'dev',
      routes: [
        {
          name: 'ai-components',
          path: '/ai-components',
          navigation: { title: 'demo.navigation.group' },
          children: expectedDemoRoutes.map(([name, path, title]) => ({
            name,
            path,
            navigation: { title },
            componentLoader: expect.any(Function),
          })),
        },
      ],
    });

    if (settingsContribution?.parent !== 'settings') {
      throw new Error('Missing AI Employee Settings Route contribution.');
    }
    const settingsPages = await Promise.all(
      (settingsContribution.routes[0]?.children ?? []).map((route) => {
        if (!route.componentLoader) {
          throw new Error(`Missing settings page loader: ${route.name}`);
        }
        return route.componentLoader();
      }),
    );
    expect(settingsPages).toHaveLength(7);
    for (const page of settingsPages) {
      expect(page.default).toEqual(expect.any(Function));
    }

    if (devContribution?.parent !== 'dev') {
      throw new Error('Missing AI Employee Dev Route contribution.');
    }
    const [demoGroup] = devContribution.routes;
    if (!demoGroup?.children) {
      throw new Error('Missing grouped AI Employee demo routes.');
    }

    const loadedPages = await Promise.all(
      demoGroup.children.map((route) => {
        if (!route.componentLoader) {
          throw new Error(`Missing demo page loader: ${route.name}`);
        }
        return route.componentLoader();
      }),
    );
    expect(loadedPages).toHaveLength(expectedDemoRoutes.length);
    for (const page of loadedPages) {
      expect(page.default).toEqual(expect.any(Function));
    }
  });
});
