---
title: 'MCP 服务管理'
description: '在 AI Employee 设置页查看 MCP 连接、启用服务并维护 Tool 权限。'
keywords: 'MCP settings,MCP tools,ASK,ALLOW,stdio,http,sse'
---

# MCP 服务管理

「MCP」Tab 列出 `config.yml` 已声明的 MCP 服务。表格显示 UID、标题、Transport、Enabled 状态和查看操作。连接定义本身只读。

![MCP 服务和 Tool](https://static-docs.nocobase.com/20260914111142-ai-employee-mcp-services.png)

## 启用或停用服务

使用 Enabled 开关控制这个 MCP 服务是否参与运行。配置重载会重建 MCP Client；服务命令、URL 或认证 Header 要在 `config.yml` 中修改。

Transport 标签可能是：

- Stdio
- HTTP (Streamable)
- HTTP + SSE (Legacy)

## 查看 Tool

点击 View 打开右侧面板。面板显示服务名称、Transport、可公开的 URL 以及当前发现的 Tool。每个 Tool 显示标题、注册名和描述。

没有 Tool 时，依次检查服务是否启用、进程或 URL 是否可访问、认证信息是否有效，以及 MCP 服务是否正确实现 Tool discovery。服务端返回给管理页的敏感 Header 和环境值会被脱敏。

## 设置 Tool 权限

每个发现的 Tool 可以选择：

| 权限  | 行为                             |
| ----- | -------------------------------- |
| Ask   | 模型提出调用后暂停，等待用户确认 |
| Allow | 满足其他运行时策略时直接调用     |

远程服务的 Tool 实现不在 NocoBase 代码库内。除非是明确无副作用、可重复且数据范围可控的读取，否则保持 Ask。MCP Tool 权限仍不能替代远程服务自己的身份校验和授权。当前权限调整保存在运行进程内，配置重载和同一进程内的 Client 重建会保留，应用重启后则按 Tool 默认规则重新计算。

## 修改连接

管理页不提供新增、编辑或删除。修改 `ai.mcpServers` 后重载应用配置，服务集合会同步，MCP Client 会重建；也可以通过重启应用走完整初始化流程。

## 相关链接

- [MCP 服务配置](../configuration/mcp.md) — 修改连接、命令和 Header
- [注册 Tool](../development/tool.md) — 理解 Ask 与 Allow
