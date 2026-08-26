---
title: '配置通知'
description: '配置 NocoBase 站内信和 SMTP 邮件通知，包括启用开关、SMTP 连接和 Provider 标识。'
keywords: 'NocoBase,通知配置,SMTP,站内信,Provider'
---

# 配置通知

通知包不读取固定的宿主环境变量。应用可以从环境变量、配置文件或其他配置源构造 `NotificationConfig`，再把它传给 `createNotificationManager()`。只需要站内信时，不必配置 SMTP。

## 配置站内信

站内信使用 database Provider。对应的 Channel 配置如下：

```ts
import { defineInAppChannelConfig } from '@nocobase/app-plugin-notification-in-app';

const inApp = defineInAppChannelConfig({
  enabled: true,
  providers: [{ type: 'database', name: 'in-app' }],
});
```

站内信通过用户 ID 定位接收人。接入收件箱 API 时，还需要创建 `InAppStore` 并挂载 `createInAppRouter()`。

## 配置 SMTP 邮件

启用邮件 Channel，并填写 SMTP 连接信息：

```ts
import {
  defineEmailChannelConfig,
  defineSmtpProviderConfig,
} from '@nocobase/app-plugin-notification-providers';

const email = defineEmailChannelConfig({
  enabled: true,
  providers: [
    defineSmtpProviderConfig({
      name: 'primary-smtp',
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: {
        user: 'mailer@example.com',
        pass: process.env.SMTP_PASSWORD ?? '',
      },
      from: 'NocoBase <mailer@example.com>',
    }),
  ],
});
```

其中：

| 配置项   | 说明                                          |
| -------- | --------------------------------------------- |
| `host`   | SMTP 服务器地址。                             |
| `port`   | SMTP 端口，通常是 `587`。                     |
| `secure` | 是否在连接时直接使用 TLS。                    |
| `auth`   | SMTP 认证用户名和密码。省略时不发送认证信息。 |
| `from`   | 默认发件人。发送消息时可以覆盖。              |

`SMTP_SECURE=true` 通常用于需要直接建立 TLS 连接的端口。端口、认证方式和发件人限制以邮件供应商的说明为准。

## 保持 Provider 标识稳定

上面的站内信 Provider 名为 `in-app`，邮件 Provider 名为 `primary-smtp`。Delivery 会保存 Provider 的 `name` 和 `type`，因此配置发布和应用重启后应保持两者不变。

轮换同一账号的密码或证书时，可以保留原来的 `name`。如果改为另一个供应商账号或不同投递目标，先处理完排队中的 Delivery，再更换 Provider 配置。

## 相关链接

- [通知概览](./overview.md)——了解 Notification、Delivery 和 Attempt
- [手动接入通知](./integration.md)——注册 definitions 并管理运行时生命周期
- [发送通知](./sending.md)——从业务代码发送消息
- [通知日志](./logs.md)——查询 Delivery 和 Attempt
