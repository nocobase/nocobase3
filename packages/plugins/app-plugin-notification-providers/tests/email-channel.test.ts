import type { NotificationChannelContext } from '@nocobase/app-plugin-notification';
import { expect, it } from 'vitest';
import { createEmailChannelDefinition } from '../server/email/channel.js';

it('validates native email addresses and accepts HTML-only messages', async () => {
  const channel = await createEmailChannelDefinition().createChannel(
    { logger: {} } as NotificationChannelContext,
    { provider: 'smtp', host: 'localhost', port: 587 },
  );
  const input = {
    to: ['a@example.com', 'b@example.com'] as const,
    subject: 'Approved',
    html: '<p>Approved</p>',
  };
  const validated = channel.validateMessage(input);
  expect(validated.recipients).toEqual([
    { address: 'a@example.com' },
    { address: 'b@example.com' },
  ]);
  expect(validated.message).toMatchObject(input);
  for (const to of [
    undefined,
    [],
    '',
    'bad',
    ['valid@example.com', 'bad'],
    { type: 'user', id: '123' },
  ]) {
    expect(() => channel.validateMessage({ ...input, to })).toThrow();
  }
  for (const message of [
    { ...input, subject: '' },
    { ...input, html: undefined },
    { ...input, text: 12 },
  ])
    expect(() => channel.validateMessage(message)).toThrow();
  expect(
    channel.validateMessage({ ...input, actionUrl: 'javascript:alert(1)' })
      .message,
  ).not.toHaveProperty('actionUrl');
});
