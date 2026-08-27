import type {
  NotificationProviderContext,
  NotificationProviderSendInput,
} from '@nocobase/app-plugin-notification';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PreparedImMessage } from '../server/im/channel.js';
import {
  createDingTalkWebhookProviderDefinition,
  createFeishuWebhookProviderDefinition,
  defineDingTalkWebhookProviderConfig,
  defineFeishuWebhookProviderConfig,
} from '../server/im/providers.js';

describe('IM webhook Providers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends DingTalk text payloads', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ errcode: 0, errmsg: 'ok' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider =
      await createDingTalkWebhookProviderDefinition().createProvider(
        providerContext(),
        defineDingTalkWebhookProviderConfig({
          name: 'primary',
          webhookUrl:
            'https://oapi.dingtalk.com/robot/send?access_token=example-token',
        }),
      );

    await expect(provider.send(sendInput())).resolves.toEqual({
      status: 'accepted',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      msgtype: 'text',
      text: { content: 'Approval\nReview it\n/approvals/1' },
    });
  });

  it('maps a Feishu application-level rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          code: 19021,
          msg: 'sign match fail or timestamp is not within one hour',
        }),
      ),
    );
    const provider =
      await createFeishuWebhookProviderDefinition().createProvider(
        providerContext(),
        defineFeishuWebhookProviderConfig({
          name: 'primary',
          webhookUrl:
            'https://open.feishu.cn/open-apis/bot/v2/hook/example-token',
        }),
      );

    await expect(provider.send(sendInput())).resolves.toEqual({
      status: 'failed',
      disposition: 'never',
      error: {
        code: '19021',
        category: 'authentication',
        message: 'sign match fail or timestamp is not within one hour',
      },
    });
  });

  it('retries provider rate limits returned with HTTP 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ code: 429, msg: 'rate limit' })),
    );
    const provider =
      await createFeishuWebhookProviderDefinition().createProvider(
        providerContext(),
        defineFeishuWebhookProviderConfig({
          name: 'primary',
          webhookUrl:
            'https://open.feishu.cn/open-apis/bot/v2/hook/example-token',
        }),
      );

    await expect(provider.send(sendInput())).resolves.toEqual({
      status: 'failed',
      disposition: 'same_provider',
      error: {
        code: '429',
        category: 'rate_limit',
        message: 'rate limit',
      },
    });
  });
});

function providerContext(): NotificationProviderContext {
  return {
    logger: {} as NotificationProviderContext['logger'],
    async now(): Promise<string> {
      return '2026-08-27T00:00:00.000Z';
    },
  };
}

function sendInput(): NotificationProviderSendInput<PreparedImMessage> {
  return {
    notificationId: 'notification-1',
    deliveryId: 'delivery-1',
    attemptId: 'attempt-1',
    deadline: '2026-08-27T00:01:00.000Z',
    signal: new AbortController().signal,
    message: {
      recipient: { namespace: 'im', providerName: 'primary' },
      content: {
        title: 'Approval',
        text: 'Review it',
        actionUrl: '/approvals/1',
      },
    },
  };
}
