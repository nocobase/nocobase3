---
title: '管理 AI 服务'
description: '使用 NocoBase AI Employee 设置页管理员工、LLM 服务和 MCP 服务。'
keywords: 'AI Employee settings,LLM Service,MCP,ai.settings'
---

# 管理 AI 服务

打开 `/settings/ai` 进入「AI Employee」设置页。实际 URL 会自动带上应用部署的 base path，例如默认本地环境可能是 `/main/settings/ai`。

![AI Employee 设置页](https://static-docs.nocobase.com/20260914111142-ai-employee-settings.png)

页面包含三个核心 Tab：

| Tab         | 用途                                           |
| ----------- | ---------------------------------------------- |
| AI Employee | 启用员工，调整角色、模型、Skill、Tool 和知识库 |
| LLM Service | 查看配置服务，启用服务并选择模型               |
| MCP         | 查看配置连接，启用服务并设置发现 Tool 的权限   |

设置 Route 要求 `ai.settings:read`。修改操作还要通过相应 API 的服务端授权；看不到页面时，先检查当前角色的设置页访问权限。

## 配置和管理页的边界

LLM 和 MCP 的连接定义来自 `config.yml`。管理页不会创建 Provider 密钥、MCP URL 或启动命令。这样可以让部署配置保持可审查、可重复，同时让管理员在不接触密钥的情况下启用服务、选择模型或调整 Tool 权限。

AI Employee 定义来自源码注册，管理页在数据库中保存用户可调整部分。Profile 中的员工身份字段是只读的，角色和能力绑定则按员工类型提供可编辑项。

## 相关链接

- [AI 员工管理](./employees.md) — 设置员工角色和能力
- [LLM 服务管理](./llm-services.md) — 选择模型并启用服务
- [MCP 服务管理](./mcp-services.md) — 检查连接和 Tool 权限
- [配置参考](../configuration/index.md) — 修改连接定义
