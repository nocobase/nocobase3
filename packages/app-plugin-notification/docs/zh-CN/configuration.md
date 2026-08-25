---
title: '配置通知'
description: '配置 NocoBase 站内信和 SMTP 邮件通知，包括启用开关、SMTP 连接和 Provider 标识。'
keywords: 'NocoBase,通知配置,SMTP,站内信,Provider'
---

# 配置通知

默认应用通过环境变量配置通知。只需要站内信时，不必配置 SMTP；需要发送邮件时，再补充邮件服务器信息。

## 启用通知

在应用的 `.env` 中启用通知服务：

```bash
NOTIFICATION_ENABLED=true
```

修改配置后需要重启应用。通知服务未启用时，通知日志和测试发送接口会返回不可用。

## 配置站内信

站内信默认使用 database Provider。启用方式如下：

```bash
NOTIFICATION_ENABLED=true
NOTIFICATION_IN_APP_ENABLED=true
```

站内信通过用户 ID 定位接收人。消息会出现在当前用户的「Notifications / My notifications」页面。

## 配置 SMTP 邮件

启用邮件 Channel，并填写 SMTP 连接信息：

```bash
NOTIFICATION_ENABLED=true
NOTIFICATION_EMAIL_ENABLED=true

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mailer@example.com
SMTP_PASSWORD=replace-with-password
SMTP_FROM=NocoBase <mailer@example.com>
```

其中：

| 配置项          | 说明                                    |
| --------------- | --------------------------------------- |
| `SMTP_HOST`     | SMTP 服务器地址。                       |
| `SMTP_PORT`     | SMTP 端口，默认是 `587`。               |
| `SMTP_SECURE`   | 是否在连接时直接使用 TLS。              |
| `SMTP_USER`     | SMTP 认证用户名。留空时不发送认证信息。 |
| `SMTP_PASSWORD` | SMTP 认证密码。                         |
| `SMTP_FROM`     | 默认发件人。发送消息时可以覆盖。        |

`SMTP_SECURE=true` 通常用于需要直接建立 TLS 连接的端口。端口、认证方式和发件人限制以邮件供应商的说明为准。

## 保持 Provider 标识稳定

默认配置中的站内信 Provider 名为 `in-app`，邮件 Provider 名为 `primary-smtp`。Delivery 会保存 Provider 的 `name` 和 `type`，因此配置发布和应用重启后应保持两者不变。

轮换同一账号的密码或证书时，可以保留原来的 `name`。如果改为另一个供应商账号或不同投递目标，先处理完排队中的 Delivery，再更换 Provider 配置。

## 验证配置

配置完成后，可以在「Notifications / Delivery logs」页面点击「Send test」，发送一条站内信或邮件。详细操作见[日志与测试发送](./logs-and-testing.md)。

## 相关链接

- [通知概览](./overview.md)——了解 Notification、Delivery 和 Attempt
- [发送通知](./sending.md)——从业务代码发送消息
- [日志与测试发送](./logs-and-testing.md)——验证站内信和 SMTP 配置
