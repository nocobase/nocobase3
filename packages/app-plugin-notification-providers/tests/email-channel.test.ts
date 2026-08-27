import type { NotificationChannelContext } from '@nocobase/app-plugin-notification';
import { describe, expect, it } from 'vitest';

import { createEmailChannelDefinition } from '../server/email/channel.js';

describe('Email Channel common input', () => {
  it('resolves recipients and renders content with overrides', async () => {
    const definition = createEmailChannelDefinition();
    const channel = await definition.createChannel(
      {} as NotificationChannelContext,
      { type: 'email', enabled: true, providers: [] },
    );

    const provider = { name: 'primary', type: 'smtp' };
    expect(
      await channel.resolveRecipient?.({
        recipient: { type: 'user', id: 'user-1' },
        provider,
      }),
    ).toEqual({ userId: 'user-1' });
    expect(
      await channel.resolveRecipient?.({
        recipient: {
          type: 'email',
          address: 'alice@example.com',
        },
        provider,
      }),
    ).toEqual({ address: 'alice@example.com' });
    expect(
      await channel.resolveRecipient?.({
        recipient: { type: 'phone', number: '123' },
        provider,
      }),
    ).toBeUndefined();
    expect(
      channel.render?.({
        content: { title: 'Approval complete', body: 'Review the result.' },
        override: { subject: 'Custom subject', html: '<p>Review</p>' },
      }),
    ).toEqual({
      subject: 'Custom subject',
      text: 'Review the result.',
      html: '<p>Review</p>',
    });
  });
});
