---
title: '开发概览'
description: '按你想做的事找到对应的页面：保护接口、改登录页、接第三方登录，以及怎么和 Agent 配合。'
keywords: 'NocoBase,认证开发,Authentication Skill,Agent'
---

# 使用 Agent 开发

认证相关的开发不需要你读 Better Auth 的 API。你描述想要的效果，Agent 读取应用里的 Authentication Skill，在你的应用代码里完成，然后把测试结果和需要你提供的配置报给你。

## 你想做的事

| 你想…                                              | 看这里                                        |
| -------------------------------------------------- | --------------------------------------------- |
| 某个接口或页面只给登录用户                         | [保护接口和页面](./protecting-apis.md)        |
| 在接口里知道当前是谁，把数据和他关联               | [保护接口和页面](./protecting-apis.md)        |
| 换成自己的 logo 和文案，登录页放多种方式，关掉注册 | [定制登录页面](./login-pages.md)              |
| 让忘记密码真的能收到邮件                           | [定制登录页面](./login-pages.md)              |
| 用 GitHub、Google 登录                             | [增加认证方式](./sign-in-methods.md)          |
| 接公司的 SSO、Keycloak、Azure AD                   | [增加认证方式](./sign-in-methods.md)          |
| 接一个 Better Auth 不认识的内部协议                | [增加认证方式](./sign-in-methods.md)          |
| 离职自动禁用账号，或从后台踢人下线                 | [使用 Authentication Skill](./using-skill.md) |

不管做哪件，先看[使用 Authentication Skill](./using-skill.md)，那里说清楚了怎么提需求、Agent 会做什么、你该审什么。

## 几条底线

Agent 知道这些，但你审核时也可以对照：

- 会话和 Cookie 只由 Better Auth 签发。自己造一套 token 或把会话放浏览器存储，会让退出、禁用和守卫全部失效。
- 「登录了」不等于「有权限」。数据范围和菜单可见性交给[权限](../../authorization.md)。
- 所有改动在应用目录里。插件包的代码和迁移不动。
- 新认证方式要的表由应用自己的 migration 建，Agent 会对照 Better Auth 文档逐项写，不让框架自动改库。

想先跑一遍再说，从[快速开始](../quick-start.md)开始。
