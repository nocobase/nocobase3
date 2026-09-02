import { describe, expect, it } from 'vitest';

import routes from '../client/routes.ts';

const expectedDemoRoutes = [
  ['ai-chat-window', '/chat', 'Chat window'],
  ['ai-floating-chat', '/floating', 'Floating chat'],
  ['ai-employee-tasks', '/tasks', 'Employee tasks'],
  ['ai-page-context', '/context', 'Page context'],
  ['ai-tool-cards', '/tools', 'Tool cards'],
] as const;

describe('AI Employee client routes', () => {
  it('contributes settings and one development-only AI Components group', async () => {
    const [settingsContribution, devContribution] = routes;

    expect(settingsContribution).toMatchObject({
      parent: 'settings',
      routes: [{ name: 'ai', path: '/ai' }],
    });
    expect(devContribution).toMatchObject({
      parent: 'dev',
      routes: [
        {
          name: 'ai-components',
          path: '/ai-components',
          navigation: { title: 'AI Components' },
          children: expectedDemoRoutes.map(([name, path, title]) => ({
            name,
            path,
            navigation: { title },
            componentLoader: expect.any(Function),
          })),
        },
      ],
    });

    if (devContribution?.parent !== 'dev') {
      throw new Error('Missing AI Employee Dev Route contribution.');
    }
    const [demoGroup] = devContribution.routes;
    if (!demoGroup || !('children' in demoGroup)) {
      throw new Error('Missing grouped AI Employee demo routes.');
    }

    const loadedPages = await Promise.all(
      demoGroup.children.map((route) => route.componentLoader()),
    );
    expect(loadedPages).toHaveLength(expectedDemoRoutes.length);
    for (const page of loadedPages) {
      expect(page.default).toEqual(expect.any(Function));
    }
  });
});
