import { expect, test } from 'vitest';
import settings from '../client/settings.ts';

test('owns one AI settings page at /settings/ai', () => {
  expect(settings()).toMatchObject([
    {
      id: 'ai',
      title: 'AI Employee',
      pageLoader: expect.any(Function),
    },
  ]);
});
