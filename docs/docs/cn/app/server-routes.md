---
title: API 接口
description: 定义 HTTP 端点、Webhook 与回调，并为每条路由配置自己的认证与鉴权。
---

# API 接口

:::warning 文档编写中
本页内容正在编写。
:::

本页将覆盖 `defineApiRoutes()` 与 `defineRootRoutes()` 的区别，以及一条重要原则：挂在 `/api` 下不代表就有认证，每条路由都要自己声明认证与鉴权。
