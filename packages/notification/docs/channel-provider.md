# 扩展 Channel 和 Provider

如果内置的站内信和 SMTP 邮件不能满足需要，可以在独立包中实现 Channel 定义并注册到 `NotificationManager`。核心包不要求你把实现代码放进 `@nocobase/notification`。

## 定义配置

配置需要包含稳定的 Channel `type` 和 Provider `type`：

```ts
interface SmsProviderConfig {
  readonly type: "example-sms";
  readonly name: string;
  readonly enabled?: boolean;
  readonly apiKey: string;
}

interface SmsChannelConfig {
  readonly type: "sms";
  readonly enabled: boolean;
  readonly providers: readonly SmsProviderConfig[];
}

export function defineSmsChannelConfig(
  input: Omit<SmsChannelConfig, "type">,
): SmsChannelConfig {
  return { type: "sms", ...input };
}
```

配置工厂只返回可序列化数据，不要在这里创建 SDK client。

## 定义收件人和消息

```ts
export interface SmsRecipient {
  readonly phoneNumber: string;
}

export interface SmsMessage {
  readonly text: string;
}
```

随后把 `sms` 加入应用的 Channel map：

```ts
interface AppNotificationChannels {
  readonly sms: {
    readonly recipient: SmsRecipient;
    readonly message: SmsMessage;
  };
}
```

## 创建 Channel 定义

```ts
import type {
  NotificationChannelDefinition,
  ProviderSendResult,
} from "@nocobase/notification";

export function createSmsChannelDefinition(): NotificationChannelDefinition<SmsChannelConfig> {
  return {
    type: "sms",
    providerDefinitions: [
      {
        type: "example-sms",
        async createProvider(_context, config) {
          const client = createExampleSmsClient({ apiKey: config.apiKey });

          return {
            name: config.name,
            type: "example-sms",
            async send(message: object): Promise<ProviderSendResult> {
              const value = message as {
                readonly to: string;
                readonly text: string;
              };

              try {
                const response = await client.send(value);
                return {
                  status: "accepted",
                  providerMessageId: response.id,
                };
              } catch (error) {
                return {
                  status: "failed",
                  error: {
                    category: "provider",
                    message:
                      error instanceof Error ? error.message : String(error),
                  },
                  allowNextProvider: true,
                };
              }
            },
            async close(): Promise<void> {
              await client.close();
            },
          };
        },
      },
    ],
    async createChannel() {
      return {
        type: "sms",
        async prepare(input: {
          readonly deliveryId: string;
          readonly notificationId: string;
          readonly recipient: SmsRecipient;
          readonly message: SmsMessage;
        }): Promise<object> {
          if (!input.recipient.phoneNumber) {
            throw new Error("SMS phone number is required.");
          }
          if (!input.message.text) {
            throw new Error("SMS text is required.");
          }

          return {
            to: input.recipient.phoneNumber,
            text: input.message.text,
          };
        },
      };
    },
  };
}
```

其中：

- `createChannel()` 负责验证收件人和消息，并生成 Provider 接收的消息
- `createProvider()` 根据配置创建 SDK client
- `Provider.send()` 只执行一次提交
- `close()` 释放 Provider 自己创建的资源

## 返回 Provider 结果

`Provider.send()` 需要返回以下结果之一：

| 结果                 | 使用场景                     |
| -------------------- | ---------------------------- |
| `accepted`           | 供应商已经接受请求           |
| `failed`             | 供应商明确拒绝或请求确定失败 |
| `submission_unknown` | 无法判断供应商是否已接受请求 |

确定失败时，可以通过 `allowNextProvider` 决定是否继续尝试配置中的下一个 Provider。

```ts
return {
  status: "failed",
  error: {
    code: "INVALID_RECIPIENT",
    category: "provider",
    message: "The phone number is invalid.",
  },
  allowNextProvider: false,
};
```

遇到超时或连接中断，而且供应商可能已经接受消息时，返回 `submission_unknown`：

```ts
return {
  status: "submission_unknown",
  error: {
    code: "REQUEST_TIMEOUT",
    category: "provider",
    message: "The provider response timed out.",
  },
};
```

:::warning 注意

如果 `Provider.send()` 直接抛出异常，Manager 会按不允许继续的失败处理。需要继续尝试下一个 Provider 时，请捕获异常并返回 `failed` 和 `allowNextProvider: true`。

`submission_unknown` 不会继续调用下一个 Provider，以免同一条消息被重复发送。

:::

## 注册和配置

应用启动前注册定义：

```ts
notification.registerChannel(createSmsChannelDefinition());
```

然后在 `config/notification.ts` 中配置：

```ts
defineSmsChannelConfig({
  enabled: true,
  providers: [
    {
      type: "example-sms",
      name: "primary",
      apiKey: env.string("SMS_API_KEY", ""),
    },
  ],
});
```

至此可以通过 `NotificationManager.send()` 使用 `sms` Channel，不需要修改核心通知包。
