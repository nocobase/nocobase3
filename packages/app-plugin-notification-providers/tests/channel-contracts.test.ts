import type { NotificationChannelContext } from '@nocobase/app-plugin-notification';
import { describe, expect, it, vi } from 'vitest';

import { createImChannelDefinition } from '../server/im/channel.js';

const context = {
  logger: {} as NotificationChannelContext['logger'],
};

describe('first-batch Channel contracts', () => {
  it('resolves provider-scoped external identities for the IM Channel', async () => {
    const resolveUserTarget = vi.fn(async () => ({
      namespace: 'feishu-webhook',
      providerName: 'primary',
    }));
    const channel = await createImChannelDefinition({
      resolveUserTarget,
    }).createChannel(context, { type: 'im', enabled: true, providers: [] });
    const provider = { name: 'primary', type: 'feishu-webhook' };

    await expect(
      channel.resolveRecipient?.({
        recipient: {
          type: 'external',
          namespace: 'feishu-webhook',
          id: 'primary',
        },
        provider,
      }),
    ).resolves.toEqual({
      namespace: 'feishu-webhook',
      providerName: 'primary',
    });
    await expect(
      channel.resolveRecipient?.({
        recipient: { type: 'user', id: 'user-1' },
        provider,
      }),
    ).resolves.toEqual({
      namespace: 'feishu-webhook',
      providerName: 'primary',
    });
    expect(resolveUserTarget).toHaveBeenCalledWith('user-1', provider);
  });
});
