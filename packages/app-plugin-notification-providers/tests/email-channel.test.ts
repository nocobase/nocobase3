import type { NotificationChannelContext } from '@nocobase/notification';
import { describe, expect, it } from 'vitest';

import { createEmailChannelDefinition } from '../server/email/channel.js';

describe('Email Channel common input', () => {
  it('resolves recipients and renders content with overrides', async () => {
    const definition = createEmailChannelDefinition();
    const channel = await definition.createChannel(
      {} as NotificationChannelContext,
      { type: 'email', enabled: true, providers: [] },
    );

    expect(channel.resolveRecipient?.({ type: 'user', id: 'user-1' })).toEqual({
      userId: 'user-1',
    });
    expect(
      channel.resolveRecipient?.({
        type: 'email',
        address: 'alice@example.com',
      }),
    ).toEqual({ address: 'alice@example.com' });
    expect(
      channel.resolveRecipient?.({ type: 'phone', number: '123' }),
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
