---
title: '应用开发'
description: '使用邮件插件 Skill 和公开组件，为业务应用接入邮件页面、模板变量和服务端发送。'
---

# 应用开发

邮件插件提供服务端收发信能力、公开客户端组件和开发示例。应用开发者决定页面放在哪里、哪些用户可以访问，以及怎样关联业务记录；应用 Agent 依据当前插件的 Skill 和接口完成接入。

## 确认 Agent 拿到了 Skill

应用安装并注册 Mail 后，检查 `.agents/skills/nocobase-app-plugin-mail/` 是否存在。缺少时，在应用根目录执行：

```bash
pnpm plugin:skills:sync
```

`.agents/skills/` 是同步生成的内容，不要直接修改。Agent 应读取当前安装版本的 Skill，结合应用中的插件注册、配置和开发示例实现需求。

## 描述业务需求

向 Agent 说明邮箱类型、页面位置、数据来源和权限边界。例如：

> 我们要在客户详情中处理邮件。销售关联自己的企业邮箱，在页面中阅读和回复邮件，使用当前客户姓名填充模板。请复用邮件插件的组件，提供生产可用的账户、签名、模板和日志入口。销售只能操作自己的邮箱，管理员只需要查看账户接入情况。请先检查已有配置和 Skill，完成实现并验证。

需要准备的信息包括：

- 使用 Gmail、Microsoft 365 还是 IMAP/SMTP，以及服务商凭据或服务器信息。
- 部署后的公共地址和应用挂载路径，用来生成 OAuth 和推送回调。
- 邮件入口放在独立页面、客户详情还是其他业务页面。
- 哪些业务字段可以作为模板变量，邮件与业务记录如何关联。
- 哪些角色可以管理自己的账户，是否确实需要全用户邮件操作。

传入模板变量只影响写信内容，不会自动建立邮件和客户的关联，也不会自动筛选出该客户的往来邮件。这些行为需要在业务需求中明确。

## 复用客户端组件

完整工作区可使用 `@nocobase/app-plugin-mail/client` 导出的 `MailWorkspacePage`。账户连接、签名、模板和标签管理可参考公开的 `MailAccountConnector`、`MailSignatureManager`、`MailTemplateManager` 和 `MailLabelManager`，由应用接入数据和交互。

组件应放在应用客户端的服务和权限上下文中，并在渲染前注册 Mail Client 插件。React 代码通过 `useMailClient()` 获取当前应用的客户端，非 React 代码可以通过 `mailClientToken` 解析；不要在模块全局创建和共享一个邮件客户端。

开发时可参考：

| 页面                 | 参考内容                             |
| -------------------- | ------------------------------------ |
| `/dev/mail/center`   | 邮件工作区、账户筛选、会话和写信交互 |
| `/dev/mail/accounts` | 账户关联、签名、模板和标签管理       |
| `/dev/mail/send`     | 普通发送、分别发送和草稿             |
| `/dev/mail/logs`     | 发送、批量发送和同步结果             |

开发页面不进入生产构建。接入时应检查生产页面中的所有链接，以及 OAuth 完成后的返回位置；当前插件默认返回开发账户页，不能仅添加邮件工作区就认为生产账户关联已完成。

## 传入业务记录

`MailWorkspacePage` 的 `templateVariables` 可以提供业务记录中的值：

```tsx
import { MailWorkspacePage } from '@nocobase/app-plugin-mail/client';

export function CustomerMail() {
  return (
    <MailWorkspacePage
      templateVariables={{ record: { customer: { name: 'Alex' } } }}
    />
  );
}
```

应用模板时，`{{record.customer.name}}` 会替换成 `Alex`。实际页面应传入当前记录中允许使用的数据；没有匹配值的变量会保留原样，发送前需要检查。

## 从业务代码发送邮件

业务代码应通过 `mailServiceToken` 解析服务，使用 `MailService.sendMessage()`，或调用 `POST /api/mail/messages/send`。个人 API 校验登录、邮件工作区权限和账户所有权，服务端接入也应保留同样的访问边界。

同一次业务发送必须复用稳定的 `idempotencyKey`。相同键用于不同内容会被拒绝；请求超时后应先查询原提交结果，不要更换新键直接重发。服务商提交结果为 `unknown` 时，应让业务进入待确认流程。

如果发送的是系统通知，使用[通知能力](../notification.md)。需要读取用户邮箱或以用户关联的账户发送时，再使用邮件服务。

## 扩展服务商和凭据存储

Gmail、Microsoft 365 和 IMAP/SMTP 已内置。其他协议可以通过扩展插件向 `mailProviderRegistryToken` 注册服务商定义，具体合同以当前插件导出的类型和 Skill 为准。

默认凭据存储将授权数据以普通 JSON 保存在数据库中。应用要求加密保存时，可以在 Mail 核心注册前提供 `mailCredentialVaultToken` 的替代实现。不要把用户邮箱密码写入前端代码或提交到仓库。

## 验收接入结果

让 Agent 完成应用的 lint、typecheck、test 和 build，并提供以下场景的验证结果：

- 生产页面能够关联账户，OAuth 成功或失败后返回可访问的页面。
- 普通用户不能读取或操作他人的账户、邮件和附件。
- 同步、阅读、回复、附件、草稿恢复和定时发送符合预期。
- 模板使用当前记录，缺失变量能在发送前发现。
- 日志能区分发送失败、部分投递和结果不确定，重试不会重复发送已成功的邮件。

## 相关链接

- [快速开始](./quick-start.md)：先验证服务商和收发信。
- [配置邮件](./configuration.md)：配置项、回调和凭据存储。
- [管理与诊断](./management.md)：账户权限、日志和故障排查。
