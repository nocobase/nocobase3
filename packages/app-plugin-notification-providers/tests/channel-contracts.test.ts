import type { NotificationChannelContext } from '@nocobase/app-plugin-notification';
import { describe, expect, it, vi } from 'vitest';

import { createImChannelDefinition } from '../server/im/channel.js';

const context = {
  logger: {} as NotificationChannelContext['logger'],
};

describe('first-batch Channel contracts', () => {
  it('resolves explicit Provider targets for the IM Channel', async () => {
    const resolveUserTarget = vi.fn(async () => ({
      provider: { name: 'primary', type: 'feishu-webhook' },
    }));
    const channel = await createImChannelDefinition({
      resolveUserTarget,
    }).createChannel(context, { type: 'im', enabled: true, providers: [] });
    const provider = { name: 'primary', type: 'feishu-webhook' };

    await expect(
      channel.resolveRecipient?.({
        recipient: {
          type: 'provider',
          provider,
        },
        provider,
      }),
    ).resolves.toEqual({
      provider,
    });
    await expect(
      channel.resolveRecipient?.({
        recipient: { type: 'user', id: 'user-1' },
        provider,
      }),
    ).resolves.toEqual({
      provider,
    });
    expect(resolveUserTarget).toHaveBeenCalledWith('user-1', provider);
  });
});
