import type { NotificationChannelContext } from '@nocobase/app-plugin-notification';
import { describe, expect, it } from 'vitest';

import { createInAppChannelDefinition } from '../server/definition.js';

describe('In-app Channel common input', () => {
  it('resolves user recipients and renders content with overrides', async () => {
    const definition = createInAppChannelDefinition();
    const channel = await definition.createChannel(
      { store: {} } as NotificationChannelContext,
      { type: 'in-app', enabled: true, providers: [] },
    );

    expect(channel.resolveRecipient?.({ type: 'user', id: 'user-1' })).toEqual({
      userId: 'user-1',
    });
    expect(
      channel.resolveRecipient?.({
        type: 'email',
        address: 'alice@example.com',
      }),
    ).toBeUndefined();
    expect(
      channel.render?.({
        content: {
          title: 'Approval complete',
          body: 'Review the result.',
          actionUrl: '/approvals/1',
        },
        override: { title: 'In-app title' },
      }),
    ).toEqual({
      title: 'In-app title',
      body: 'Review the result.',
      actionUrl: '/approvals/1',
    });
  });
});
