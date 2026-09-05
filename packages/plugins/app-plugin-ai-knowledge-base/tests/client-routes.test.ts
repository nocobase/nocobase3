import { expect, test } from 'vitest';
import routes from '../client/routes.ts';

const expectedNavigation = [
  ['ai-knowledge-base-directory', '/', 'Knowledge bases'],
  ['ai-knowledge-base-documents', '/documents', 'Documents'],
  ['ai-knowledge-base-upload', '/upload', 'Document upload'],
  ['ai-knowledge-base-segments', '/segments', 'Segments'],
  ['ai-knowledge-base-hit-tests', '/hit-tests', 'Hit tests'],
  ['ai-knowledge-base-workspace', '/workspace', 'Knowledge base workspace'],
] as const;

test('registers six development-only Knowledge Base pages in order', async () => {
  expect(routes.parent).toBe('dev');
  expect(routes.routes).toHaveLength(1);

  const [group] = routes.routes;
  expect(group).toMatchObject({
    name: 'ai-knowledge-base',
    path: '/ai-knowledge-base',
    navigation: { title: 'AI Knowledge Base' },
  });
  expect(group && 'children' in group ? group.children : []).toHaveLength(6);

  const children = group && 'children' in group ? group.children : [];
  expect(
    children.map((route) => [route.name, route.path, route.navigation?.title]),
  ).toEqual(expectedNavigation);

  for (const route of children) {
    expect(route.componentLoader).toBeTypeOf('function');
    const loaded = await route.componentLoader?.();
    expect(loaded?.default).toBeTypeOf('function');
  }

  expect(routes.routes.slice(1)).toEqual([]);
});
