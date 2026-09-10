import type { NotificationChannelContext } from '@nocobase/app-plugin-notification';
import { describe, expect, it, vi } from 'vitest';

import { createImChannelDefinition } from '../server/im/channel.js';
import { createEmailChannelDefinition } from '../server/email/channel.js';

const context = {
  logger: {} as NotificationChannelContext['logger'],
};

describe('first-batch Channel contracts', () => {
  it('converts safe Email test fields into normal send inputs', () => {
    const adapter = createEmailChannelDefinition().test;
    expect(adapter?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'recipient', type: 'email' }),
        expect.objectContaining({ name: 'body', type: 'textarea' }),
      ]),
    );
    expect(
      adapter?.toSendInput({
        actor: { userId: 'user-1' },
        values: {
          recipient: 'recipient@example.com',
          title: 'Test',
          body: 'Hello',
        },
        channelConfig: { type: 'email', enabled: true, providers: [] },
        providerConfig: {
          type: 'smtp',
          name: 'primary',
          host: 'smtp.example.com',
          port: 587,
        },
      }),
    ).toEqual({
      to: { type: 'email', address: 'recipient@example.com' },
      content: { title: 'Test', body: 'Hello' },
    });
  });

  it('converts IM test fields without a recipient', () => {
    const adapter = createImChannelDefinition().test;
    expect(
      adapter?.toSendInput({
        actor: { userId: 'user-1' },
        values: { title: 'Test', body: 'Hello' },
        channelConfig: { type: 'im', enabled: true, providers: [] },
        providerConfig: {
          type: 'feishu-webhook',
          name: 'primary',
        },
      }),
    ).toEqual({
      content: { title: 'Test', body: 'Hello' },
    });
  });

  it('resolves an omitted recipient directly to the selected IM Provider', async () => {
    const resolveUserTarget = vi.fn(async () => ({
      provider: { name: 'primary', type: 'feishu-webhook' },
    }));
    const provider = { name: 'primary', type: 'feishu-webhook' };
    const channel = await createImChannelDefinition({
      resolveUserTarget,
    }).createChannel(context, {
      type: 'im',
      enabled: true,
      providers: [provider],
    });
    await expect(
      channel.resolveRecipient?.({
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

  it('resolves each selected Provider when no recipient is supplied', async () => {
    const provider = { name: 'dingtalk', type: 'dingtalk-webhook' };
    const channel = await createImChannelDefinition().createChannel(context, {
      type: 'im',
      enabled: true,
      providers: [provider],
    });

    await expect(
      channel.resolveRecipient?.({
        provider,
      }),
    ).resolves.toEqual({ provider });
  });
});
