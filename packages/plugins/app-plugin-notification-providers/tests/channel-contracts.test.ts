import type { NotificationChannelContext } from '@nocobase/app-plugin-notification';
import { expect, it } from 'vitest';
import { createImChannelDefinition } from '../server/im/channel.js';
import { createEmailChannelDefinition } from '../server/email/channel.js';

it('accepts webhook messages with complete HTTP(S) targets and rejects all recipients', async () => {
  const channel = await createImChannelDefinition().createChannel(
    { logger: {} } as NotificationChannelContext,
    { provider: 'feishu-webhook' },
  );
  const message = {
    text: 'Review',
    target: { type: 'url', url: 'https://example.com/main/topics/123' },
  };
  expect(channel.validateMessage(message)).toMatchObject({
    message,
    recipients: [{ webhook: true }],
  });
  for (const to of [undefined, '123', [], { type: 'user', id: '123' }])
    expect(() => channel.validateMessage({ ...message, to })).toThrow(
      'do not accept to',
    );
  for (const target of [
    { type: 'route', path: '/topic' },
    { type: 'url', url: 'javascript:alert(1)' },
  ])
    expect(() => channel.validateMessage({ ...message, target })).toThrow();
  expect(() => channel.validateMessage({ text: '' })).toThrow();
  expect(
    channel.validateMessage({ text: 'Hello', actionUrl: '/ignored' }).message,
  ).not.toHaveProperty('actionUrl');
});

it('builds complete messages from test fields', () => {
  expect(
    createEmailChannelDefinition().test?.toSendInput({
      actor: { userId: 'user-1' },
      values: { recipient: 'a@example.com', subject: 'Test', text: 'Hello' },
      channelConfig: { provider: 'smtp', host: 'localhost', port: 587 },
    }),
  ).toEqual({ to: 'a@example.com', subject: 'Test', text: 'Hello' });
  expect(
    createImChannelDefinition().test?.toSendInput({
      actor: { userId: 'user-1' },
      values: { title: 'Test', text: 'Hello' },
      channelConfig: { provider: 'feishu-webhook' },
    }),
  ).toEqual({ title: 'Test', text: 'Hello' });
});
