import type { NotificationChannelContext } from '@nocobase/app-plugin-notification';
import { describe, expect, it, vi } from 'vitest';

import { createImChannelDefinition } from '../server/im/channel.js';

const context = {
  logger: {} as NotificationChannelContext['logger'],
};

describe('first-batch Channel contracts', () => {
  it('resolves configured Provider targets for the IM Channel', async () => {
    const resolveUserTarget = vi.fn(async () => ({
      provider: { name: 'primary', type: 'feishu-webhook' },
    }));
    const provider = { name: 'primary', type: 'feishu-webhook' };
    const channel = await createImChannelDefinition({
      resolveUserTarget,
    }).createChannel(context, {
      type: 'im',
      enabled: true,
      providers: [{ ...provider, target: 'default' }],
    });
    await expect(
      channel.resolveRecipient?.({
        recipient: { type: 'target', id: 'default' },
        provider,
      }),
    ).resolves.toEqual({
      provider,
    });
    await expect(
      channel.resolveRecipient?.({
        recipient: { type: 'target', id: 'other' },
        provider,
      }),
    ).resolves.toBeUndefined();
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

  it('resolves the configured recipient for each Provider being prepared', async () => {
    const provider = { name: 'dingtalk', type: 'dingtalk-webhook' };
    const channel = await createImChannelDefinition().createChannel(context, {
      type: 'im',
      enabled: true,
      providers: [{ ...provider, target: 'default' }],
    });

    await expect(
      channel.resolveRecipient?.({
        recipient: { type: 'target', id: 'default' },
        provider,
      }),
    ).resolves.toEqual({ provider });
  });
});
