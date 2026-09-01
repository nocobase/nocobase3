import type { NotificationChannelContext } from '@nocobase/app-plugin-notification';
import { describe, expect, it, vi } from 'vitest';

import { createEmailChannelDefinition } from '../server/email/channel.js';

describe('Email Channel common input', () => {
  it('resolves recipients and renders content with overrides', async () => {
    const resolveUserEmail = vi.fn(
      async (userId: string, provider: { readonly name: string }) =>
        provider.name === 'primary' ? `${userId}@example.com` : undefined,
    );
    const definition = createEmailChannelDefinition({ resolveUserEmail });
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
    ).toEqual({ address: 'user-1@example.com' });
    expect(resolveUserEmail).toHaveBeenCalledWith('user-1', provider);
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
