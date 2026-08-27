import { createHmac } from 'node:crypto';

import type {
  NotificationProviderDefinition,
  ProviderSendResult,
} from '@nocobase/app-plugin-notification';

import { postJson, validateHttpUrl } from '../http.js';
import type { PreparedImMessage } from './channel.js';
import { formatImText } from './channel.js';
import { evaluateJsonResult } from './result.js';

interface ImWebhookProviderConfig {
  readonly name: string;
  readonly enabled?: boolean;
  readonly webhookUrl: string;
}

export interface FeishuWebhookProviderConfig extends ImWebhookProviderConfig {
  readonly type: 'feishu-webhook';
  readonly secret?: string;
}

export interface DingTalkWebhookProviderConfig extends ImWebhookProviderConfig {
  readonly type: 'dingtalk-webhook';
  readonly secret?: string;
}

export function defineFeishuWebhookProviderConfig(
  input: Omit<FeishuWebhookProviderConfig, 'type'>,
): FeishuWebhookProviderConfig {
  return { type: 'feishu-webhook', ...input };
}

export function defineDingTalkWebhookProviderConfig(
  input: Omit<DingTalkWebhookProviderConfig, 'type'>,
): DingTalkWebhookProviderConfig {
  return { type: 'dingtalk-webhook', ...input };
}

export function createFeishuWebhookProviderDefinition(): NotificationProviderDefinition<
  FeishuWebhookProviderConfig,
  PreparedImMessage
> {
  return {
    type: 'feishu-webhook',
    async createProvider(_context, config) {
      validateHttpUrl(config.webhookUrl, {
        allowedHosts: ['open.feishu.cn', 'open.larksuite.com'],
      });
      return {
        name: config.name,
        type: 'feishu-webhook',
        async send({
          message,
          signal,
          deliveryId,
        }): Promise<ProviderSendResult> {
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const body = message.content.payloads?.feishu ?? {
            msg_type: 'text',
            content: { text: formatImText(message.content) },
          };
          return postJson(
            config.webhookUrl,
            config.secret
              ? {
                  ...body,
                  timestamp,
                  sign: createHmac(
                    'sha256',
                    `${timestamp}\n${config.secret}`,
                  ).digest('base64'),
                }
              : body,
            { signal },
            {
              headers: { 'x-nocobase-delivery-id': deliveryId },
              evaluateSuccess: (response) =>
                evaluateJsonResult(response, {
                  code: ['code'],
                  message: ['msg'],
                  success: (code) => code === 0,
                }),
            },
          );
        },
      };
    },
  };
}

export function createDingTalkWebhookProviderDefinition(): NotificationProviderDefinition<
  DingTalkWebhookProviderConfig,
  PreparedImMessage
> {
  return {
    type: 'dingtalk-webhook',
    async createProvider(_context, config) {
      validateHttpUrl(config.webhookUrl, {
        allowedHosts: ['oapi.dingtalk.com'],
      });
      return {
        name: config.name,
        type: 'dingtalk-webhook',
        async send({
          message,
          signal,
          deliveryId,
        }): Promise<ProviderSendResult> {
          const timestamp = Date.now().toString();
          const url = new URL(config.webhookUrl);
          if (config.secret) {
            url.searchParams.set('timestamp', timestamp);
            url.searchParams.set(
              'sign',
              createHmac('sha256', config.secret)
                .update(`${timestamp}\n${config.secret}`)
                .digest('base64'),
            );
          }
          return postJson(
            url.toString(),
            message.content.payloads?.dingtalk ?? {
              msgtype: 'text',
              text: { content: formatImText(message.content) },
            },
            { signal },
            {
              headers: { 'x-nocobase-delivery-id': deliveryId },
              evaluateSuccess: (response) =>
                evaluateJsonResult(response, {
                  code: ['errcode'],
                  message: ['errmsg'],
                  success: (code) => code === 0,
                }),
            },
          );
        },
      };
    },
  };
}
