import { expect, test } from 'vitest';
import settings from '../client/settings.ts';

test('owns one AI settings page at /settings/ai', () => {
  expect(settings).toMatchObject({
    parent: 'settings',
    routes: [
      {
        name: 'ai',
        path: '/ai',
        navigation: { title: 'AI Employee' },
        componentLoader: expect.any(Function),
      },
    ],
  });
});
