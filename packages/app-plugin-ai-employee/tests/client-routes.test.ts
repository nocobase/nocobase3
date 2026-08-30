import { expect, test } from 'vitest';
import routes from '../client/routes.ts';

test('AI settings pages are contributed through application settings', () => {
  expect(routes).toMatchObject({
    parent: 'settings',
    routes: [{ name: 'ai', path: '/ai' }],
  });
});
