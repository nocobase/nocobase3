---
title: '增加认证方式'
description: '接入 GitHub、Google、企业 SSO、Magic Link 或公司内部协议：Agent 会选哪种机制、你要准备什么、交付时看什么。'
keywords: 'NocoBase,社交登录,OIDC,SSO,Better Auth 插件,migration'
---

# 增加认证方式

认证层是 Better Auth，所以加一种认证方式大多数时候是把 Better Auth 的配置放进应用，再补上需要的表、按钮和测试。Agent 会按下面的顺序找最省事的机制，越靠上越安全、改动越小：

| 你要接的                                | Agent 会用                  | 要加表吗                |
| --------------------------------------- | --------------------------- | ----------------------- |
| GitHub、Google 等 Better Auth 内置平台  | `socialProviders` 配置      | 不用，复用 `account` 表 |
| 任何标准 OAuth 2.0 或 OIDC，如 Keycloak | `genericOAuth` 插件         | 不用，复用 `account` 表 |
| Magic Link、邮箱验证码、Passkey、双因素 | 对应的 Better Auth 官方插件 | 看插件文档，多数要      |
| 门户 ticket、专有签名这类内部协议       | 自定义 Better Auth 插件     | 通常要                  |

登录之后才发生的业务操作不算认证方式，那只是一个要登录的普通接口。

## 提需求前先准备好

把这些一次给全，缺的 Agent 会来问：

```text
要接什么：
协议或身份平台：
怎么发起登录、怎么回到应用：
平台给的稳定用户标识（issuer + subject）：
首次登录是否自动建账号：
能不能关联已有账号，按什么关联：
需要哪些环境变量：
生产环境回调地址：
退出时要不要同时退出身份平台：
```

最重要的是「稳定用户标识」。OAuth 和 OIDC 有 issuer 和 subject，企业协议也得给出等价的东西。邮箱可以用来展示和联系，但不能用来当身份，按邮箱合并账号方便，也是最容易被冒用的地方，所以只有你明确说了 Agent 才会做。

## 三个例子

**社交登录**

> 加 GitHub 登录，用 Better Auth 现成的 provider。首次登录可以自动建账号，同邮箱的已有账号不要自动合并。做完告诉我要配哪些环境变量、回调地址填什么。

**企业 OIDC**

> 公司用 Keycloak，让员工用公司账号登录。绑定用 issuer 加 subject，不允许首次登录自动建号，账号由管理员先建好再绑。先说说你打算用哪种机制、我要在 Keycloak 登记什么，再动手。

**内部协议**

> 公司门户会把用户带回来并附一个一次性 ticket，我们要调门户接口验证它。Better Auth 没有对应 provider。把协议调用和 Better Auth 接入分开写，绑定用 issuer 加 subject，ticket 要防重放并限流，会话必须还是 Better Auth 创建的。交付 migration、配置、登录入口、测试和部署说明。

## 关于加表

配一个 Better Auth 插件不会自动改数据库。它要的表和字段，Agent 会对照 Better Auth 文档里那个插件的 schema 段落，逐项写成应用自己的 migration，并在测试库里跑一遍。审核时可以直接要求：

> 把这个插件文档里声明的每个 model 和字段列出来，逐项对应到你写的 migration。

社交登录和 OAuth、OIDC 复用现有的 `account` 表，不需要新表。插件自带的迁移不动，也不让 Better Auth 自动改表。

## 交付时看什么

- 用的是表里最靠上的可行机制，理由说得通；
- 稳定标识是什么，有没有按邮箱合并；
- migration 和插件文档一致，`up` 和 `down` 都测过；
- 回调地址、issuer、audience、state 或 nonce 有验证；
- 一次性凭据原子消费、有限流、多实例用共享存储；
- 密钥只在服务端，日志不含凭据；
- 测试覆盖：新用户首次登录、已绑定用户再登录、无效或过期或重复使用的凭据、并发首次登录只建一条绑定、登录后能访问受保护接口、退出后失效。

## 上线

Agent 会给你环境变量清单和回调地址。回调要在身份平台和应用两边都登记，生产的公网地址和子路径要先在应用配置里设好，不然回调会指到错误的地址。
