---
title: 让 AI 参与开发
description: AGENTS.md 与 skills 如何让 AI 按项目约定写代码。
---

# 让 AI 参与开发

:::warning 文档编写中
本页内容正在编写。
:::

应用里有三层给 AI 读的约定：

- **`AGENTS.md`** —— 全局规则，AI 首先读它
- **`skills/nocobase-app-development/`** —— 应用自己的详细开发指南，按任务分页
- **`.agents/skills/`** —— 已安装插件各自发布的技能，注册插件时自动同步

本页说明这三层如何配合，以及如何随应用演进维护它们。
